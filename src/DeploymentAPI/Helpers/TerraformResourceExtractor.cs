using System.Text.RegularExpressions;
using DeploymentAPI.DTOs;

namespace DeploymentAPI.Helpers;

// Powers the "fake plan" preview (TerraformController.Preview) - a
// deliberately simple, regex/scan-based read of the stored HCL text, NOT a
// real HCL parser and NOT terraform itself. Good enough to answer "what
// resource types and names does this describe" for a quick, no-Azure-calls
// preview; anything genuinely ambiguous is surfaced as unresolved rather
// than silently guessing, since this app never actually evaluates
// Terraform expressions.
//
// Two things a naive "does this block contain the text for_each" scan gets
// wrong, both fixed here:
//
// 1. A `dynamic "x" { for_each = ... }` sub-block (which repeats a NESTED
//    config block within one resource - it does not multiply the resource
//    itself) sitting inside a resource with no for_each of its own would
//    otherwise be mistaken for that resource's own for_each. Fixed by only
//    reading for_each/count/name at DEPTH 1 of the resource's own braces
//    (FindTopLevelValue) - never inside a nested {...} of any kind.
//
// 2. The real multiplier is often on a `module "x" { source = "./modules/
//    y" for_each = ... }` block, not on any resource inside that module at
//    all - every resource declared in modules/y/*.tf gets created once per
//    module instance. BuildModuleMultiplierIndex resolves each module
//    block's own for_each/count and attributes it to every resource whose
//    file lives under that module's source folder, correctly SUMMING
//    multiple module blocks that share the same source folder (e.g. two
//    separate `module "x" { source = "./modules/web_app" ... }` calls -
//    exactly the "one module folder, called twice with different maps"
//    shape a shared module invites).
public static class TerraformResourceExtractor
{
    private static readonly Regex ResourceHeaderPattern = new(
        @"resource\s+""([A-Za-z0-9_]+)""\s+""([A-Za-z0-9_-]+)""\s*\{",
        RegexOptions.Compiled);

    private static readonly Regex ModuleHeaderPattern = new(
        @"module\s+""([A-Za-z0-9_-]+)""\s*\{", RegexOptions.Compiled);

    private static readonly Regex VariableBlockPattern = new(
        @"variable\s+""([A-Za-z0-9_-]+)""\s*\{", RegexOptions.Compiled);

    private static readonly Regex LocalsBlockPattern = new(@"locals\s*\{", RegexOptions.Compiled);

    private static readonly Regex NameAttributePattern = new(
        @"^name\s*=\s*""([^""]*)""", RegexOptions.Compiled);

    private static readonly Regex ForEachLinePattern = new(@"^for_each\s*=\s*(.+)$", RegexOptions.Compiled);
    private static readonly Regex CountLinePattern = new(@"^count\s*=\s*(.+)$", RegexOptions.Compiled);
    private static readonly Regex SourceLinePattern = new(@"^source\s*=\s*""([^""]*)""", RegexOptions.Compiled);

    // A for_each/count expression that references exactly one var.X or
    // local.X, optionally wrapped in toset()/tolist()/length() - the
    // handful of wrapper functions real Terraform code actually uses
    // around a for_each/count source. Anything else (a ternary, string
    // concatenation, a function over something other than one plain
    // reference) is left unresolved.
    private static readonly Regex ReferencePattern = new(
        @"^(?:toset|tolist|length)?\(?\s*(var|local)\.([A-Za-z0-9_-]+)\s*\)?$", RegexOptions.Compiled);

    // The extremely common `for k, v in var.Y : k => {...}` local-value
    // idiom - the result has the SAME KEYS as var.Y (only values are
    // transformed), so resolving local.X here means resolving var.Y
    // instead. Not real expression evaluation, just recognizing this one
    // shape (used by exactly this kind of "reshape a map of app configs"
    // local before passing it to a module's for_each).
    private static readonly Regex ForInVarPattern = new(
        @"for\s+[A-Za-z0-9_]+(?:\s*,\s*[A-Za-z0-9_]+)?\s+in\s+var\.([A-Za-z0-9_-]+)\s*:", RegexOptions.Compiled);

    private sealed record ModuleCall(bool HasForEachOrCount, int? Count, List<string>? Names);

    private sealed record Multiplier(bool HasForEachOrCount, int? Count, List<string>? Names);

    public static List<ProjectResourceSummaryDto> Extract(IEnumerable<PersonalTerraformFileDetailDto> files)
    {
        var fileList = files as IReadOnlyCollection<PersonalTerraformFileDetailDto> ?? files.ToList();

        var variableValues = BuildVariableValueIndex(fileList);
        var localRawValues = BuildLocalRawValueIndex(fileList);
        var moduleMultipliers = BuildModuleMultiplierIndex(fileList, variableValues, localRawValues);

        var results = new List<ProjectResourceSummaryDto>();

        foreach (var file in fileList)
        {
            if (!file.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)
                && !file.FileName.EndsWith(".tf.json", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var folder = GetContainingFolder(file.FileName);
            moduleMultipliers.TryGetValue(folder, out var moduleMultiplier);

            foreach (Match header in ResourceHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1; // the opening '{'
                var blockEnd = FindMatchingBrace(file.Content, blockStart);

                var block = blockEnd > blockStart
                    ? file.Content.Substring(blockStart, blockEnd - blockStart + 1)
                    : string.Empty;

                var declaredName = FindTopLevelValue(block, NameAttributePattern);
                var forEachExpr = FindTopLevelValue(block, ForEachLinePattern);
                var countExpr = FindTopLevelValue(block, CountLinePattern);

                var ownHasForEachOrCount = forEachExpr != null || countExpr != null;

                (int? ownCount, List<string>? ownNames) = forEachExpr != null
                    ? TryResolveForEach(forEachExpr, variableValues, localRawValues)
                    : countExpr != null
                        ? (TryResolveCount(countExpr, variableValues, localRawValues), null)
                        : (null, null);

                var combined = Combine(moduleMultiplier, ownHasForEachOrCount, ownCount, ownNames);

                results.Add(new ProjectResourceSummaryDto
                {
                    FileName = file.FileName,
                    ResourceType = header.Groups[1].Value,
                    LocalName = header.Groups[2].Value,
                    DeclaredName = declaredName, // NameAttributePattern's own capture group is already unquoted
                    HasForEachOrCount = combined?.HasForEachOrCount ?? false,
                    InstanceCount = combined?.Count,
                    InstanceNames = combined?.Names
                });
            }
        }

        return results;
    }

    // Discovers "you can add a new X here" targets - each one an editable
    // spot in an uploaded .tfvars file that already drives a real for_each/
    // count. Two genuinely different shapes, both covered:
    //
    // A) A module's OWN for_each resolves directly to a project-level
    //    var/local (web apps, function apps) - one target per module call,
    //    so two modules sharing one source folder (this project's own
    //    api_web_apps + miscellaneous_web_apps both pointing at
    //    modules/web_app) correctly show as two separate, separately-
    //    addable targets, not one merged one.
    //
    // B) The multiplying for_each sits on a RESOURCE inside a module that
    //    itself is NOT for_each'd (service bus queues) - the resource's own
    //    for_each references a variable that's local to that module
    //    (declared in the module's own variables.tf), populated by the
    //    calling module block's own argument passing
    //    (queues = [for q in var.servicebus_queues : ...]) rather than by a
    //    for_each. Resolved by one extra hop through that module call's own
    //    arguments.
    public static List<AddResourceTargetDto> BuildAddTargets(IEnumerable<PersonalTerraformFileDetailDto> files)
    {
        var fileList = files as IReadOnlyCollection<PersonalTerraformFileDetailDto> ?? files.ToList();

        var variableValues = BuildVariableValueIndex(fileList);
        var localRawValues = BuildLocalRawValueIndex(fileList);

        var targets = new List<AddResourceTargetDto>();

        // Case A.
        foreach (var file in fileList.Where(f => f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (Match header in ModuleHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);

                var sourceRaw = FindTopLevelValue(block, SourceLinePattern);
                var folder = sourceRaw != null ? NormalizeModuleSource(sourceRaw) : null;
                if (folder == null) continue;

                var forEachExpr = FindTopLevelValue(block, ForEachLinePattern);
                if (forEachExpr == null) continue;

                var resolved = ResolveAddableVariable(forEachExpr, variableValues, localRawValues);
                if (resolved == null) continue;

                var resourceType = GuessPrimaryResourceType(fileList, folder);
                if (resourceType == null) continue;

                targets.Add(new AddResourceTargetDto
                {
                    ResourceType = resourceType,
                    ModuleLocalName = header.Groups[1].Value,
                    VariableName = resolved.Value.Name,
                    FileName = FindTfvarsFileDeclaring(fileList, resolved.Value.Name) ?? "terraform.tfvars",
                    Shape = resolved.Value.Shape,
                    ExistingCount = resolved.Value.Entries.Count
                });
            }
        }

        // Case B.
        var moduleArgsByFolder = BuildModuleArgsByFolder(fileList);

        foreach (var file in fileList.Where(f => f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)))
        {
            var folder = GetContainingFolder(file.FileName);
            if (!moduleArgsByFolder.TryGetValue(folder, out var argSets)) continue;

            foreach (Match header in ResourceHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);
                var forEachExpr = FindTopLevelValue(block, ForEachLinePattern);
                if (forEachExpr == null) continue;

                // Already directly resolvable (a plain project-level var/
                // local) - case A (or the ordinary Extract() path) already
                // covers it, no module-argument hop needed.
                if (ResolveAddableVariable(forEachExpr, variableValues, localRawValues) != null) continue;

                var refMatch = ReferencePattern.Match(forEachExpr.Trim());
                if (!refMatch.Success || refMatch.Groups[1].Value != "var") continue;

                var localVarName = refMatch.Groups[2].Value;

                foreach (var args in argSets)
                {
                    if (!args.TryGetValue(localVarName, out var argValue)) continue;

                    var resolved = ResolveAddableVariable(argValue.Trim(), variableValues, localRawValues);
                    if (resolved == null) continue;

                    targets.Add(new AddResourceTargetDto
                    {
                        ResourceType = header.Groups[1].Value,
                        ModuleLocalName = string.Empty,
                        VariableName = resolved.Value.Name,
                        FileName = FindTfvarsFileDeclaring(fileList, resolved.Value.Name) ?? "terraform.tfvars",
                        Shape = resolved.Value.Shape,
                        ExistingCount = resolved.Value.Entries.Count
                    });
                }
            }
        }

        // Dedupe by variable - multiple resources sharing one for_each
        // source (e.g. servicebus's queue AND its authorization_rule both
        // driven by the same servicebus_queues variable) means one actual
        // "add a queue" action, not two near-identical entries differing
        // only by which resource happened to be scanned.
        return targets
            .GroupBy(t => t.VariableName, StringComparer.Ordinal)
            .Select(g => g.First())
            .ToList();
    }

    // Every INDIVIDUAL instance across every add target - what the
    // "Resources" tab lists for renaming. Reuses BuildAddTargets to find
    // valid targets (VariableName/Shape/FileName/ResourceType, already
    // resolved through any local/module-argument indirection - case A/B
    // above), then re-reads each target's own resolved variable directly
    // (always a plain top-level tfvars variable by the time BuildAddTargets
    // hands it back, regardless of how indirect the ORIGINAL for_each
    // expression was) to flatten its individual entries.
    public static List<ResourceInstanceDto> BuildResourceInstances(IEnumerable<PersonalTerraformFileDetailDto> files)
    {
        var fileList = files as IReadOnlyCollection<PersonalTerraformFileDetailDto> ?? files.ToList();

        var variableValues = BuildVariableValueIndex(fileList);
        var targets = BuildAddTargets(fileList);

        var instances = new List<ResourceInstanceDto>();

        foreach (var target in targets)
        {
            if (!variableValues.TryGetValue(target.VariableName, out var raw)) continue;

            foreach (var (key, displayName) in EntriesOf(raw, target.Shape))
            {
                instances.Add(new ResourceInstanceDto
                {
                    ResourceType = target.ResourceType,
                    VariableName = target.VariableName,
                    FileName = target.FileName,
                    Shape = target.Shape,
                    Key = key,
                    DisplayName = displayName
                });
            }
        }

        return instances;
    }

    private static (string Name, string Shape, List<(string Key, string DisplayName)> Entries)? ResolveAddableVariable(
        string expression, Dictionary<string, string> variableValues, Dictionary<string, string> localRawValues)
    {
        var trimmedExpr = expression.Trim();

        // The expression ITSELF may directly be a `[for x in var.Y : ...]`
        // comprehension - not everywhere this idiom shows up is a locals
        // value wrapping it; a module ARGUMENT commonly is one directly
        // (queues = [for queue in var.servicebus_queues : ...]).
        var directForInVar = ForInVarPattern.Match(trimmedExpr);

        if (directForInVar.Success && variableValues.TryGetValue(directForInVar.Groups[1].Value, out var directRaw))
        {
            var directShape = ShapeOf(directRaw);
            if (directShape != null)
                return (directForInVar.Groups[1].Value, directShape, EntriesOf(directRaw, directShape));
        }

        var match = ReferencePattern.Match(trimmedExpr);
        if (!match.Success) return null;

        if (match.Groups[1].Value == "var")
        {
            if (!variableValues.TryGetValue(match.Groups[2].Value, out var raw)) return null;
            var shape = ShapeOf(raw);
            return shape == null ? null : (match.Groups[2].Value, shape, EntriesOf(raw, shape));
        }

        // local - only the "for k, v in var.Y : k => {...}" idiom is
        // resolvable, same as the display-count path.
        if (!localRawValues.TryGetValue(match.Groups[2].Value, out var localExpr)) return null;

        var forInVarMatch = ForInVarPattern.Match(localExpr);
        if (!forInVarMatch.Success) return null;

        var sourceVarName = forInVarMatch.Groups[1].Value;
        if (!variableValues.TryGetValue(sourceVarName, out var sourceRaw)) return null;

        var sourceShape = ShapeOf(sourceRaw);
        return sourceShape == null ? null : (sourceVarName, sourceShape, EntriesOf(sourceRaw, sourceShape));
    }

    private static string? ShapeOf(string raw)
    {
        var trimmed = raw.Trim();
        if (trimmed.StartsWith('{')) return "Map";
        if (trimmed.StartsWith('[')) return "List";
        return null;
    }

    // Key = the exact map key or list element's own literal string (what
    // TerraformTfvarsEditor.RenameEntry actually matches against to rename
    // an entry); DisplayName = a friendlier label where one exists (a map
    // entry's own nested "name" attribute) but always falls back to Key.
    private static List<(string Key, string DisplayName)> EntriesOf(string raw, string shape)
    {
        var inner = StripOuterBracket(raw.Trim());

        if (shape == "Map")
        {
            return ParseTopLevelAssignments(inner)
                .Select(e => (e.Key, ExtractNameOrFallback(e.Value, e.Key)))
                .ToList();
        }

        return SplitTopLevelElements(inner)
            .Select(el => (StripQuotesIfPresent(el), ExtractNameOrLiteral(el)))
            .ToList();
    }

    private static string StripQuotesIfPresent(string text)
    {
        var trimmed = text.Trim();
        return trimmed.Length >= 2 && trimmed[0] == '"' && trimmed[^1] == '"' ? trimmed[1..^1] : trimmed;
    }

    // The first resource declared in a module's source folder - a
    // reasonable stand-in for "the main thing this module creates" (e.g.
    // modules/web_app declares the web app itself before its deployment
    // slot), used only to label an add target, never to compute a count.
    private static string? GuessPrimaryResourceType(IReadOnlyCollection<PersonalTerraformFileDetailDto> fileList, string folder)
    {
        foreach (var file in fileList.Where(f => f.FileName.StartsWith(folder + "/", StringComparison.Ordinal)))
        {
            var m = ResourceHeaderPattern.Match(file.Content);
            if (m.Success) return m.Groups[1].Value;
        }

        return null;
    }

    private static string? FindTfvarsFileDeclaring(IReadOnlyCollection<PersonalTerraformFileDetailDto> fileList, string variableName)
    {
        foreach (var file in fileList.Where(f =>
            f.FileName.EndsWith(".tfvars", StringComparison.OrdinalIgnoreCase)
            || f.FileName.EndsWith(".tfvars.json", StringComparison.OrdinalIgnoreCase)))
        {
            if (ParseTopLevelAssignments(file.Content).ContainsKey(variableName))
                return file.FileName;
        }

        return null;
    }

    // folder -> every module call's own top-level arguments, for case B's
    // one-hop resolution above.
    private static Dictionary<string, List<Dictionary<string, string>>> BuildModuleArgsByFolder(
        IReadOnlyCollection<PersonalTerraformFileDetailDto> fileList)
    {
        var result = new Dictionary<string, List<Dictionary<string, string>>>(StringComparer.Ordinal);

        foreach (var file in fileList.Where(f => f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (Match header in ModuleHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);
                var sourceRaw = FindTopLevelValue(block, SourceLinePattern);
                var folder = sourceRaw != null ? NormalizeModuleSource(sourceRaw) : null;
                if (folder == null) continue;

                if (!result.TryGetValue(folder, out var list))
                    result[folder] = list = new List<Dictionary<string, string>>();

                list.Add(ParseTopLevelAssignments(block));
            }
        }

        return result;
    }

    // "modules/web_app/main.tf" -> "modules/web_app"; a root-level file
    // ("main.tf") -> "" (never matches any module's source, which is
    // exactly correct - nothing multiplies a root-level resource).
    private static string GetContainingFolder(string fileName)
    {
        var lastSlash = fileName.LastIndexOf('/');
        return lastSlash < 0 ? string.Empty : fileName[..lastSlash];
    }

    private static Multiplier? Combine(Multiplier? module, bool ownHasForEachOrCount, int? ownCount, List<string>? ownNames)
    {
        if (module == null)
            return ownHasForEachOrCount ? new Multiplier(true, ownCount, ownNames) : null;

        var hasAny = true; // a module multiplier always means "more than one is plausible"

        if (!ownHasForEachOrCount)
            return new Multiplier(hasAny, module.Count, module.Names);

        // The resource inside the module ALSO has its own for_each/count -
        // multiply counts when both sides resolved; drop names rather than
        // attempt a module-key x resource-key cross product.
        if (module.Count is int m && ownCount is int r)
            return new Multiplier(hasAny, m * r, null);

        return new Multiplier(hasAny, null, null);
    }

    // module source folder -> the combined multiplier from every module
    // block whose source resolves to that folder (SUMMED when more than
    // one module call shares a folder - e.g. two separate `module "x" {
    // source = "./modules/web_app" for_each = ... }` blocks each creating
    // their own set of web apps from that one shared module).
    private static Dictionary<string, Multiplier> BuildModuleMultiplierIndex(
        IReadOnlyCollection<PersonalTerraformFileDetailDto> files,
        Dictionary<string, string> variableValues,
        Dictionary<string, string> localRawValues)
    {
        var callsByFolder = new Dictionary<string, List<ModuleCall>>(StringComparer.Ordinal);

        foreach (var file in files.Where(f => f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (Match header in ModuleHeaderPattern.Matches(file.Content))
            {
                var blockStart = header.Index + header.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);

                var sourceMatch = FindTopLevelValue(block, SourceLinePattern);
                if (sourceMatch == null) continue;

                var folder = NormalizeModuleSource(sourceMatch);
                if (folder == null) continue;

                var forEachExpr = FindTopLevelValue(block, ForEachLinePattern);
                var countExpr = FindTopLevelValue(block, CountLinePattern);

                if (forEachExpr == null && countExpr == null)
                    continue; // a plain, un-multiplied module call - nothing to propagate

                var (count, names) = forEachExpr != null
                    ? TryResolveForEach(forEachExpr, variableValues, localRawValues)
                    : (TryResolveCount(countExpr!, variableValues, localRawValues), null);

                if (!callsByFolder.TryGetValue(folder, out var list))
                    callsByFolder[folder] = list = new List<ModuleCall>();

                list.Add(new ModuleCall(true, count, names));
            }
        }

        var result = new Dictionary<string, Multiplier>(StringComparer.Ordinal);

        foreach (var (folder, calls) in callsByFolder)
        {
            if (calls.Any(c => c.Count == null))
            {
                result[folder] = new Multiplier(true, null, null);
                continue;
            }

            var totalCount = calls.Sum(c => c.Count!.Value);
            var allNames = calls.All(c => c.Names != null)
                ? calls.SelectMany(c => c.Names!).ToList()
                : null;

            result[folder] = new Multiplier(true, totalCount, allNames);
        }

        return result;
    }

    // "./modules/web_app" / "modules/web_app" / "modules/web_app/" -> "modules/web_app".
    // A registry source ("Azure/naming/azurerm"), a relative parent
    // reference ("../shared"), or anything else not shaped like a local
    // subfolder this project actually stores returns null - nothing to
    // attribute to.
    private static string? NormalizeModuleSource(string source)
    {
        var trimmed = source.Trim();

        if (!trimmed.StartsWith("./", StringComparison.Ordinal) && !trimmed.StartsWith("modules/", StringComparison.Ordinal))
            return null;

        if (trimmed.StartsWith("./", StringComparison.Ordinal))
            trimmed = trimmed[2..];

        return trimmed.TrimEnd('/');
    }

    // Project-level variable defaults ONLY - a `variable "X" { default = ... }`
    // declared inside a MODULE's own folder (modules/foo/variables.tf, or
    // inline in modules/foo/main.tf) is that module's own INPUT variable,
    // invisible outside it, and must never be treated as if it were a
    // project-level fallback for `var.X` elsewhere. Without this
    // root-only filter, a module declaring its own `variable "queues"`
    // (entirely normal, idiomatic Terraform - every generated module in
    // TerraformNewResourceTemplates does exactly this) would fool Case B's
    // "already directly resolvable" check into thinking the module's OWN
    // for_each-driving resource was a project-level variable with the
    // module's default value, silently dropping it as an add target
    // instead of resolving it through the calling module's own argument.
    private static Dictionary<string, string> BuildVariableValueIndex(IReadOnlyCollection<PersonalTerraformFileDetailDto> files)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var file in files.Where(f =>
            f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)
            && GetContainingFolder(f.FileName).Length == 0))
        {
            foreach (Match m in VariableBlockPattern.Matches(file.Content))
            {
                var blockStart = m.Index + m.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);
                var assignments = ParseTopLevelAssignments(block);

                if (assignments.TryGetValue("default", out var defaultValue))
                    values[m.Groups[1].Value] = defaultValue;
            }
        }

        foreach (var file in files.Where(f =>
            f.FileName.EndsWith(".tfvars", StringComparison.OrdinalIgnoreCase)
            || f.FileName.EndsWith(".tfvars.json", StringComparison.OrdinalIgnoreCase)))
        {
            foreach (var (name, value) in ParseTopLevelAssignments(file.Content))
                values[name] = value;
        }

        return values;
    }

    // local name -> its raw, unresolved expression text (may itself be a
    // literal map/list, or a for-expression matching ForInVarPattern, or
    // something else this app leaves alone). Root-only, same reasoning as
    // BuildVariableValueIndex's own comment - a `locals` block inside a
    // module folder is scoped to that module alone.
    private static Dictionary<string, string> BuildLocalRawValueIndex(IReadOnlyCollection<PersonalTerraformFileDetailDto> files)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var file in files.Where(f =>
            f.FileName.EndsWith(".tf", StringComparison.OrdinalIgnoreCase)
            && GetContainingFolder(f.FileName).Length == 0))
        {
            foreach (Match m in LocalsBlockPattern.Matches(file.Content))
            {
                var blockStart = m.Index + m.Length - 1;
                var blockEnd = FindMatchingBrace(file.Content, blockStart);
                if (blockEnd <= blockStart) continue;

                var block = file.Content.Substring(blockStart, blockEnd - blockStart + 1);

                foreach (var (name, value) in ParseTopLevelAssignments(block))
                    values[name] = value;
            }
        }

        return values;
    }

    private static (int? Count, List<string>? Names) TryResolveForEach(
        string expression, Dictionary<string, string> variableValues, Dictionary<string, string> localRawValues)
    {
        var rawValue = ResolveReference(expression, variableValues, localRawValues);
        if (rawValue == null) return (null, null);

        var trimmed = rawValue.Trim();

        if (trimmed.StartsWith('{'))
        {
            var entries = ParseTopLevelAssignments(StripOuterBracket(trimmed));
            var names = entries.Select(e => ExtractNameOrFallback(e.Value, e.Key)).ToList();
            return (names.Count, names);
        }

        if (trimmed.StartsWith('['))
        {
            var elements = SplitTopLevelElements(StripOuterBracket(trimmed));
            var names = elements.Select(ExtractNameOrLiteral).ToList();
            return (names.Count, names);
        }

        return (null, null);
    }

    // count doesn't key its instances by name the way for_each does (they're
    // just indices 0..N-1), so this only ever resolves a number - never a
    // per-instance name list.
    private static int? TryResolveCount(string expression, Dictionary<string, string> variableValues, Dictionary<string, string> localRawValues)
    {
        if (int.TryParse(expression, out var literal))
            return literal;

        var lengthMatch = Regex.Match(expression, @"^length\(\s*(var|local)\.([A-Za-z0-9_-]+)\s*\)$");
        var kind = lengthMatch.Success ? lengthMatch.Groups[1].Value : null;
        var target = lengthMatch.Success ? lengthMatch.Groups[2].Value : null;

        string? rawValue;

        if (target != null)
        {
            rawValue = kind == "local"
                ? ResolveReference($"local.{target}", variableValues, localRawValues)
                : ResolveReference($"var.{target}", variableValues, localRawValues);
        }
        else
        {
            rawValue = ResolveReference(expression, variableValues, localRawValues);
        }

        if (rawValue == null) return null;

        var trimmed = rawValue.Trim();

        if (int.TryParse(trimmed, out var asNumber))
            return asNumber;

        if (trimmed.StartsWith('{'))
            return ParseTopLevelAssignments(StripOuterBracket(trimmed)).Count;

        if (trimmed.StartsWith('['))
            return SplitTopLevelElements(StripOuterBracket(trimmed)).Count;

        return null;
    }

    // Resolves a "var.X" or "local.X" (optionally toset()/tolist()-wrapped)
    // expression to a raw literal value's text. local.X additionally tries
    // the ForInVarPattern idiom (same keys as the var it iterates) before
    // falling back to its own raw text, in case that happens to be a plain
    // literal itself.
    private static string? ResolveReference(string expression, Dictionary<string, string> variableValues, Dictionary<string, string> localRawValues)
    {
        var match = ReferencePattern.Match(expression);
        if (!match.Success) return null;

        var kind = match.Groups[1].Value;
        var name = match.Groups[2].Value;

        if (kind == "var")
            return variableValues.TryGetValue(name, out var v) ? v : null;

        if (!localRawValues.TryGetValue(name, out var localExpr))
            return null;

        var forInVarMatch = ForInVarPattern.Match(localExpr);

        if (forInVarMatch.Success)
            return variableValues.TryGetValue(forInVarMatch.Groups[1].Value, out var sourceVar) ? sourceVar : null;

        var trimmed = localExpr.Trim();
        return trimmed.StartsWith('{') || trimmed.StartsWith('[') ? localExpr : null;
    }

    // Prefers a `name = "..."` attribute inside the entry's own value (the
    // common "map of objects, each with its own name" shape); falls back to
    // the map key itself (the common "map keyed by the app's own name"
    // shape) when there's no nested name attribute.
    private static string ExtractNameOrFallback(string entryValue, string key)
    {
        var trimmed = entryValue.TrimStart();
        var nameMatch = Regex.Match(trimmed, @"(?<![\w.])name\s*=\s*""([^""]*)""");
        return nameMatch.Success ? nameMatch.Groups[1].Value : key;
    }

    // A list element is either a bare quoted string (the value itself is
    // the name) or an object with its own `name = "..."` attribute.
    private static string ExtractNameOrLiteral(string element)
    {
        var trimmed = element.Trim();

        if (trimmed.StartsWith('"') && trimmed.EndsWith('"') && trimmed.Length >= 2)
            return trimmed[1..^1];

        var nameMatch = Regex.Match(trimmed, @"(?<![\w.])name\s*=\s*""([^""]*)""");
        return nameMatch.Success ? nameMatch.Groups[1].Value : trimmed;
    }

    internal static string StripOuterBracket(string text) =>
        text.Length >= 2 ? text[1..^1] : string.Empty;

    // A deliberately loose HCL-lite scanner, for text that is PURELY a
    // sequence of "identifier = <value>" assignments (a .tfvars file, a
    // variable/locals block's own body) - NOT for a resource/module body,
    // which can also contain bare nested blocks (site_config {}, dynamic
    // "x" {}) that don't start with "identifier =" at all; use
    // FindTopLevelValue for those instead. Finds every top-level assignment
    // sequentially (never re-matching inside a value it already consumed),
    // returning each one's raw, untouched value text (still HCL syntax - a
    // quoted string, a [...] list, or a {...} object).
    //
    // \G (not ^/Multiline) - entries in a real HCL object/tfvars file can
    // be separated by a newline OR a comma ("{ a = {}, b = {}, c = {} }" is
    // valid HCL on one line, not just one-per-line), so the next entry's
    // start is found by explicitly skipping whitespace/commas from where
    // the previous value ended, then anchoring the match to exactly that
    // position - not by searching for the next line start, which a
    // same-line comma-separated entry would never be at.
    //
    // A key is either a bare identifier (region = ...) OR a quoted string
    // ("vcpms-app-cluster04-A" = ...) - real .tfvars maps very commonly use
    // quoted keys (confirmed against a real project's own tfvars file),
    // which a bare-identifier-only pattern would simply never match at all,
    // silently resolving the whole map to zero entries.
    private static readonly Regex IdentifierEqualsPattern = new(
        @"\G(?:([A-Za-z_][A-Za-z0-9_-]*)|""([^""]*)"")[ \t]*=[ \t]*", RegexOptions.Compiled);

    internal static Dictionary<string, string> ParseTopLevelAssignments(string text)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var position = 0;

        while (position < text.Length)
        {
            // Skips whitespace, commas, a leading '{' (this is called both
            // on a value's own inner text and on a whole block's text
            // INCLUDING its own opening brace), and comments (# / // line
            // comments, /* */ block comments) - real .tfvars/variable/
            // locals content very commonly has blank lines and explanatory
            // comments between top-level entries (confirmed against a real
            // project's own tfvars file - the very thing that first broke
            // this), none of which should ever stop this scan from finding
            // the next real assignment.
            bool advanced;

            do
            {
                advanced = false;

                while (position < text.Length
                    && (char.IsWhiteSpace(text[position]) || text[position] == ',' || text[position] == '{'))
                {
                    position++;
                    advanced = true;
                }

                if (position < text.Length && text[position] == '#')
                {
                    var nl = text.IndexOf('\n', position);
                    position = nl < 0 ? text.Length : nl + 1;
                    advanced = true;
                }
                else if (position + 1 < text.Length && text[position] == '/' && text[position + 1] == '/')
                {
                    var nl = text.IndexOf('\n', position);
                    position = nl < 0 ? text.Length : nl + 1;
                    advanced = true;
                }
                else if (position + 1 < text.Length && text[position] == '/' && text[position + 1] == '*')
                {
                    var close = text.IndexOf("*/", position + 2, StringComparison.Ordinal);
                    position = close < 0 ? text.Length : close + 2;
                    advanced = true;
                }
            }
            while (advanced && position < text.Length);

            if (position >= text.Length) break;

            var m = IdentifierEqualsPattern.Match(text, position);
            if (!m.Success || m.Index != position) break;

            var name = m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value;
            var valueStart = m.Index + m.Length;
            var valueEnd = FindAssignmentValueEnd(text, valueStart);

            if (!result.ContainsKey(name))
                result[name] = text.Substring(valueStart, valueEnd - valueStart).Trim();

            position = valueEnd;
        }

        return result;
    }

    // For a resource/module BODY specifically (block[0] is its own opening
    // '{') - finds the value of a single top-level "keyword = value" line,
    // explicitly skipping over ANY nested construct that opens a brace on
    // its way (a plain sub-block like site_config {}, a dynamic "x" {}
    // block, a map-literal-valued attribute) so a same-named attribute
    // sitting inside one of those is never mistaken for this block's own.
    // This is what fixes a nested `dynamic "x" { for_each = ... }` from
    // being read as the resource's own for_each.
    private static string? FindTopLevelValue(string block, Regex linePattern)
    {
        var depth = 0;
        var inString = false;
        var lineStart = 0;
        var lineStartDepth = 0;

        for (var i = 0; i <= block.Length; i++)
        {
            var atEnd = i == block.Length;
            var c = atEnd ? '\n' : block[i];

            if (!atEnd && inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (!atEnd && c == '"') { inString = true; continue; }

            if (c == '\n')
            {
                if (lineStartDepth == 1)
                {
                    var line = block[lineStart..i].TrimStart();
                    var m = linePattern.Match(line);
                    if (m.Success) return m.Groups[1].Value.Trim();
                }

                lineStart = i + 1;
                lineStartDepth = depth;
                continue;
            }

            if (!atEnd)
            {
                if (c == '{') depth++;
                else if (c == '}') depth--;
            }
        }

        return null;
    }

    // Comma-or-newline-separated top-level elements inside a [...] list's
    // inner text - same bracket/quote-depth reasoning as
    // FindAssignmentValueEnd, just splitting on "," in addition to "\n".
    internal static List<string> SplitTopLevelElements(string text)
    {
        var elements = new List<string>();
        var depth = 0;
        var inString = false;
        var start = 0;

        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }
            if (c == '[' || c == '{') depth++;
            else if (c == ']' || c == '}') depth--;
            else if ((c == ',' || c == '\n') && depth == 0)
            {
                var piece = text[start..i].Trim();
                if (piece.Length > 0) elements.Add(piece);
                start = i + 1;
            }
        }

        var last = text[start..].Trim();
        if (last.Length > 0) elements.Add(last);

        return elements;
    }

    private static int FindAssignmentValueEnd(string text, int start)
    {
        var depth = 0;
        var inString = false;

        for (var i = start; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }
            if (c == '[' || c == '{') depth++;
            else if (c == ']' || c == '}')
            {
                depth--;
                if (depth < 0) return i; // hit the enclosing block's own closing brace
            }
            else if ((c == '\n' || c == ',') && depth <= 0)
            {
                return i;
            }
        }

        return text.Length;
    }

    // Plain brace-depth counting from the opening '{' at startIndex -
    // sufficient for finding a resource/module/variable/locals block's own
    // boundaries (this never needs to understand HCL syntax beyond matching
    // braces outside string literals).
    private static int FindMatchingBrace(string text, int startIndex)
    {
        var depth = 0;
        var inString = false;

        for (var i = startIndex; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (c == '\\') { i++; continue; }
                if (c == '"') inString = false;
                continue;
            }

            if (c == '"') { inString = true; continue; }

            if (c == '{') depth++;
            else if (c == '}')
            {
                depth--;
                if (depth == 0) return i;
            }
        }

        return -1;
    }
}
