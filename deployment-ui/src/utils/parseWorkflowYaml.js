import { load } from "js-yaml";

// The most common reason a pasted template fails to parse is whitespace,
// not real structural problems: leading tabs (YAML indentation must be
// spaces) and trailing whitespace confuse the indentation-sensitive
// parser. This fixes only those two things — it deliberately does not try
// to guess at deeper structural misalignment, since a wrong guess there
// would silently change what the workflow means.
export function tryFixIndentation(yamlText) {

    let changed = false;

    const fixedLines = yamlText.split("\n").map((line) => {

        let fixed = line;
        const leadingTabs = fixed.match(/^\t+/);

        if (leadingTabs) {
            fixed = "  ".repeat(leadingTabs[0].length) + fixed.slice(leadingTabs[0].length);
        }

        const trimmed = fixed.replace(/[ \t]+$/, "");

        if (trimmed !== fixed) fixed = trimmed;
        if (fixed !== line) changed = true;

        return fixed;

    });

    return changed ? fixedLines.join("\n") : null;

}

// Turns a pasted GitHub Actions workflow OR Azure DevOps pipeline YAML into
// a job dependency graph: jobs grouped into layers, where layer N only
// contains jobs whose dependencies are all satisfied by earlier layers —
// this is what makes the graph renderable left-to-right without guessing
// at positions.
export function parseWorkflowYaml(yamlText) {

    if (!yamlText || !yamlText.trim()) {
        throw new Error("Paste a workflow or pipeline YAML template first.");
    }

    let doc;

    try {
        doc = load(yamlText);
    }
    catch (err) {
        throw new Error(formatYamlError(err));
    }

    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        throw new Error("This doesn't look like a pipeline file — expected a YAML mapping at the top level.");
    }

    const flavor = detectFlavor(doc);

    if (!flavor) {
        throw new Error(
            "No jobs found — this doesn't look like a GitHub Actions workflow (needs a top-level " +
            "\"jobs:\" mapping) or an Azure DevOps pipeline (needs \"stages:\", \"jobs:\", or \"steps:\")."
        );
    }

    const paramsMap = resolveParametersMap(doc);
    const jobs = flavor === "github"
        ? extractGitHubJobs(doc)
        : extractAzureJobs(doc, flavor, paramsMap);

    if (jobs.length === 0) {
        throw new Error("No jobs could be found in this pipeline.");
    }

    validateJobDependencies(jobs);

    const layers = computeLayers(jobs);

    return {
        name: doc.name || "",
        jobs,
        layers,
        // Shown as a "Run this pipeline" picker before starting — mirrors
        // GitHub's "Run workflow" panel (workflow_dispatch inputs) and
        // Azure's own pre-run parameter dialog.
        runParameters: flavor === "github" ? resolveGitHubDispatchInputs(doc) : resolveRunParameters(doc),
        defaultBranch: resolveDefaultBranch(doc, flavor)
    };

}

// Every job's "needs"/"dependsOn" has to point at a job that actually
// exists in this same pipeline, or computeLayers would silently strand it
// in no layer at all — pulled out of parseWorkflowYaml so this validation
// pass stops counting toward its cognitive complexity.
function validateJobDependencies(jobs) {

    const knownIds = new Set(jobs.map((job) => job.id));

    for (const job of jobs) {
        for (const dep of job.needs) {
            if (!knownIds.has(dep)) {
                const depLabel = dep.includes("::") ? dep.split("::").pop() : dep;
                throw new Error(`Job "${job.name}" depends on "${depLabel}", which doesn't exist in this pipeline.`);
            }
        }
    }

}

// A real trigger (GitHub's "Run workflow" button, Azure's "Run pipeline")
// always asks which branch to run against, even when a workflow declares
// no other inputs — this looks for a declared trigger branch to offer as
// a starting point, falling back to "main" since a static preview has no
// real repository to list branches from.
function resolveDefaultBranch(doc, flavor) {

    if (flavor === "github") {
        const branches = doc.on?.push?.branches;
        if (Array.isArray(branches) && branches.length > 0) return branches[0];
        return "main";
    }

    const azureTrigger = doc.trigger && typeof doc.trigger === "object" ? doc.trigger : null;
    const repoTrigger = doc.resources?.repositories?.[0]?.trigger;

    const branches = azureTrigger?.branches?.include
        || (repoTrigger && typeof repoTrigger === "object" ? repoTrigger.branches?.include : null);

    if (Array.isArray(branches) && branches.length > 0) return branches[0];

    return "main";

}

function resolveGitHubDispatchInputs(doc) {

    const dispatch = doc.on?.workflow_dispatch;
    const inputs = dispatch && typeof dispatch === "object" ? dispatch.inputs : null;

    if (!inputs || typeof inputs !== "object") return [];

    return Object.keys(inputs).map((name) => {

        const raw = inputs[name] || {};
        const type = raw.type === "boolean" ? "boolean" : (raw.type === "choice" ? "choice" : "string");

        return {
            name,
            displayName: raw.description || name,
            type,
            default: raw.default ?? (type === "boolean" ? false : ""),
            options: Array.isArray(raw.options) ? raw.options : null
        };

    });

}

function formatYamlError(err) {

    if (err && err.name === "YAMLException") {
        const line = err.mark ? err.mark.line + 1 : null;
        const reason = err.reason || err.message;
        return line ? `YAML error at line ${line} — ${reason}` : `YAML error — ${reason}`;
    }

    return `YAML syntax error — ${err.message}`;

}

function detectFlavor(doc) {

    if (doc.jobs && typeof doc.jobs === "object" && !Array.isArray(doc.jobs) && Object.keys(doc.jobs).length > 0) {
        return "github";
    }

    if (Array.isArray(doc.stages)) return "azure-stages";
    if (Array.isArray(doc.jobs)) return "azure-jobs";
    if (Array.isArray(doc.steps)) return "azure-steps";

    return null;

}

//===========================================================
// GitHub Actions
//===========================================================

function extractGitHubJobs(doc) {

    return Object.keys(doc.jobs).map((id) => {

        const raw = doc.jobs[id] || {};

        const needs = raw.needs
            ? (Array.isArray(raw.needs) ? raw.needs : [raw.needs])
            : [];

        const steps = Array.isArray(raw.steps)
            ? raw.steps.map((step, index) => ({ name: githubStepLabel(step, index) }))
            : [];

        // A job targeting an environment with required reviewers pauses
        // for approval on real GitHub — this is what the simulated Run
        // stops for, same as it stops for Azure's own run parameters.
        const environment = typeof raw.environment === "string"
            ? raw.environment
            : (raw.environment && typeof raw.environment === "object" ? raw.environment.name : null);

        return {
            id,
            name: raw.name || id,
            needs,
            runsOn: Array.isArray(raw["runs-on"]) ? raw["runs-on"].join(", ") : (raw["runs-on"] || ""),
            steps,
            environment: environment || null,
            referencedParams: []
        };

    });

}

function githubStepLabel(step, index) {

    if (!step || typeof step !== "object") return `Step ${index + 1}`;

    if (step.name) return step.name;
    if (step.uses) return step.uses;
    if (step.run) return firstLine(step.run);

    return `Step ${index + 1}`;

}

//===========================================================
// Azure DevOps
//===========================================================

function extractAzureJobs(doc, flavor, paramsMap) {

    if (flavor === "azure-steps") {

        return [{
            id: "job",
            name: doc.name || "Pipeline",
            needs: [],
            runsOn: doc.pool?.vmImage || doc.pool?.name || "",
            steps: doc.steps.map((step, index) => ({ name: azureStepLabel(step, index) }))
        }];

    }

    if (flavor === "azure-jobs") {

        const expanded = expandEachLoops(doc.jobs, doc, paramsMap);
        return expanded.map((raw) => normalizeAzureJob(raw, [], null)).filter(Boolean);

    }

    // azure-stages: job IDs only need to be unique WITHIN a stage on real
    // Azure — the same job id (e.g. "Deploy_Public") commonly repeats
    // across several stages (one per deploy target). Job objects here are
    // keyed by "<stage>::<job>" internally so those don't collide into a
    // single node (or, worse, a job ending up depending on itself once a
    // same-named job from an earlier stage got treated as its
    // predecessor) — the stage prefix never reaches the UI, which still
    // shows each job's own displayName/id.
    //
    // Stage order/dependency: a stage's own "dependsOn" (a stage name, or
    // list of them) is honored when present, including an explicit empty
    // list (run immediately, no stage dependency). Only when a stage
    // declares no dependsOn at all does this fall back to Azure's actual
    // default — depends on the immediately preceding stage.
    const expandedStages = expandEachLoops(doc.stages, doc, paramsMap);
    const jobs = [];
    const jobIdsByStage = {};
    let previousStageName = null;

    expandedStages.forEach((stage, stageIndex) => {

        const stageName = stage?.stage || `stage-${stageIndex}`;
        const stageJobsRaw = Array.isArray(stage?.jobs) ? stage.jobs : [];

        const hasStageDependsOn = stage && typeof stage === "object"
            && Object.prototype.hasOwnProperty.call(stage, "dependsOn");

        const dependsOnStages = hasStageDependsOn
            ? (Array.isArray(stage.dependsOn) ? stage.dependsOn : [stage.dependsOn]).filter(Boolean)
            : (previousStageName ? [previousStageName] : []);

        const implicitNeeds = dependsOnStages.flatMap((depStage) => jobIdsByStage[depStage] || []);
        const currentStageJobIds = [];

        stageJobsRaw.forEach((raw) => {

            const job = normalizeAzureJob(raw, implicitNeeds, stageName);

            if (job) {
                jobs.push(job);
                currentStageJobIds.push(job.id);
            }

        });

        jobIdsByStage[stageName] = currentStageJobIds;
        previousStageName = stageName;

    });

    return jobs;

}

function normalizeAzureJob(raw, implicitNeeds, stageName) {

    if (!raw || typeof raw !== "object") return null;

    // "- template: some-job.yml" + parameters: pulls a job in from another
    // file this preview never sees, so there's no real job/deployment id
    // or step list to read — normalizeTemplateRefJob approximates both
    // from whatever's recognizable in the template call itself.
    if (!raw.job && !raw.deployment && !raw.name && raw.template) {
        return normalizeTemplateRefJob(raw, implicitNeeds, stageName);
    }

    const bareId = raw.job || raw.deployment || raw.name;
    if (!bareId) return null;

    const id = stageName ? `${stageName}::${bareId}` : bareId;

    const hasDependsOn = Object.prototype.hasOwnProperty.call(raw, "dependsOn");

    // Job-level dependsOn refers to another job within the SAME stage on
    // real Azure (cross-stage ordering is a stage-level concern) — so
    // targets get the same stage prefix as this job's own id.
    const needs = hasDependsOn
        ? (Array.isArray(raw.dependsOn) ? raw.dependsOn : [raw.dependsOn])
            .filter(Boolean)
            .map((dep) => (stageName ? `${stageName}::${dep}` : dep))
        : (implicitNeeds || []);

    const steps = Array.isArray(raw.steps)
        ? raw.steps.map((step, index) => ({ name: azureStepLabel(step, index) }))
        : [];

    // A deployment job targeting an environment with checks configured
    // pauses for approval on real Azure, same as GitHub's environment
    // gate — reuses the same simulated Approve/Reject pause.
    const environment = typeof raw.environment === "string"
        ? raw.environment
        : (raw.environment && typeof raw.environment === "object" ? raw.environment.name : null);

    return {
        id,
        name: raw.displayName || bareId,
        needs,
        runsOn: raw.pool?.vmImage || raw.pool?.name || "",
        steps,
        environment: environment || null,
        referencedParams: extractReferencedParams(raw.condition)
    };

}

// Best-effort stand-in for a job pulled in via "- template: path.yml" +
// parameters: — there's no way to know that file's real job id, steps, or
// whether it has its own environment gate, since it's a separate file
// this preview never reads. Falls back to whichever parameter looks like
// it identifies what's being deployed (the common "projectName"/"name"
// convention for a per-item deploy template), so same-template calls in
// an each-loop still end up as distinct, correctly-named nodes instead of
// colliding into one.
function normalizeTemplateRefJob(raw, implicitNeeds, stageName) {

    const params = (raw.parameters && typeof raw.parameters === "object") ? raw.parameters : {};
    const label = params.projectName || params.name || params.displayName;
    const bareId = label ? `${raw.template}::${label}` : `${raw.template}::${JSON.stringify(params)}`;
    const id = stageName ? `${stageName}::${bareId}` : bareId;

    const hasDependsOn = Object.prototype.hasOwnProperty.call(raw, "dependsOn");

    const needs = hasDependsOn
        ? (Array.isArray(raw.dependsOn) ? raw.dependsOn : [raw.dependsOn])
            .filter(Boolean)
            .map((dep) => (stageName ? `${stageName}::${dep}` : dep))
        : (implicitNeeds || []);

    const suffix = typeof params.displayNameSuffix === "string" ? ` ${params.displayNameSuffix}` : "";

    return {
        id,
        name: label ? `${label}${suffix}` : raw.template,
        needs,
        runsOn: "",
        steps: [{ name: `Template: ${raw.template} (steps not visible — defined in another file)` }],
        environment: typeof params.environmentName === "string" ? params.environmentName : null,
        referencedParams: extractReferencedParams(raw.condition)
    };

}

// Full evaluation of Azure's condition expression language (and/or/eq,
// runtime variables, dependency outputs) isn't something a static preview
// can do faithfully — there's no real git history or prior job output to
// check against. Instead this extracts which boolean run parameters a
// job's condition mentions, so the simulated run can ask about exactly
// those via the same checkbox picker Azure itself shows before a manual
// run, and skip the job if none of them end up checked.
function extractReferencedParams(conditionText) {

    if (typeof conditionText !== "string") return [];

    const names = new Set();

    for (const match of conditionText.matchAll(/\{\{param:(\w+)\}\}/g)) {
        names.add(match[1]);
    }

    for (const match of conditionText.matchAll(/\$\{\{\s*parameters\.(\w+)\s*\}\}/g)) {
        names.add(match[1]);
    }

    return [...names];

}

function azureStepLabel(step, index) {

    if (!step || typeof step !== "object") return `Step ${index + 1}`;

    if (step.displayName) return step.displayName;
    if (step.task) return String(step.task).split("@")[0];
    if (step.checkout) return `Checkout: ${step.checkout}`;
    if (step.script) return firstLine(step.script);
    if (step.powershell) return firstLine(step.powershell);
    if (step.pwsh) return firstLine(step.pwsh);
    if (step.bash) return firstLine(step.bash);
    if (step.publish) return `Publish: ${step.publish}`;
    if (step.download) return `Download: ${step.download}`;
    if (step.template) return `Template: ${step.template}`;

    return `Step ${index + 1}`;

}

//===========================================================
// Azure "${{ each x in y }}:" template-loop expansion
//
// Azure DevOps pipelines commonly generate a job (or a set of steps) per
// item of a parameter list using this loop syntax, which a plain YAML
// parser leaves as a literal, unusable string key. Since the loop source
// is very often a parameter declared with a static default right in the
// same file (as opposed to something only known at pipeline-run time),
// this expands that specific, common case — a fixed list, one level of
// substitution ("${{ item.field }}" / "${{ upper(item.field) }}") — and
// deliberately leaves anything else (conditionals, cross-parameter
// expressions, runtime-only values) untouched rather than guessing.
//===========================================================

const EACH_LOOP_KEY = /^\$\{\{\s*each\s+(\w+)\s+in\s+([\w.]+)\s*\}\}$/;
const IF_BLOCK_KEY = /^\$\{\{\s*if\s+(.+)\s*\}\}$/;

// Only boolean/string/number parameters make sense as something a person
// picks in a dialog before running — "projects" (an object/list, used only
// as a template-loop source) isn't something to prompt for.
function resolveRunParameters(doc) {

    if (!Array.isArray(doc.parameters)) return [];

    return doc.parameters
        .filter((param) => param && ["boolean", "string", "number"].includes(param.type))
        .map((param) => ({
            name: param.name,
            displayName: param.displayName || param.name,
            type: param.type,
            default: param.default,
            options: null
        }));

}

function resolveParametersMap(doc) {

    const map = {};

    if (Array.isArray(doc.parameters)) {
        doc.parameters.forEach((param) => {
            if (param && param.name !== undefined) map[param.name] = param.default;
        });
    }

    return map;

}

function resolveLoopSource(path, paramsMap) {

    const key = path.startsWith("parameters.") ? path.slice("parameters.".length) : path;
    return Object.prototype.hasOwnProperty.call(paramsMap, key) ? paramsMap[key] : null;

}

function resolveLoopExpr(expr, loopVar, item) {

    const parts = expr.split(".");
    if (parts[0] !== loopVar) return undefined;

    let value = item;

    for (let i = 1; i < parts.length; i++) {
        if (value == null) return undefined;
        value = value[parts[i]];
    }

    return value;

}

function substituteLoopVars(text, loopVar, item) {

    return text
        // parameters[format('build_{0}', project.name)] — a dynamic
        // parameter-name lookup, common in per-item conditions. The name
        // itself ("build_Admin") is knowable now (project.name is), but
        // its VALUE is only chosen later when the user runs the pipeline
        // — so this resolves to a {{param:build_Admin}} marker rather
        // than a value, for extractReferencedParams to pick up.
        .replace(/\$\{\{\s*parameters\[\s*format\(\s*'([^']*)'\s*,\s*([\w.]+)\s*\)\s*\]\s*\}\}/g, (match, fmt, expr) => {
            const value = resolveLoopExpr(expr, loopVar, item);
            return value === undefined ? match : `{{param:${fmt.replace("{0}", String(value))}}}`;
        })
        .replace(/\$\{\{\s*upper\(\s*([\w.]+)\s*\)\s*\}\}/g, (match, expr) => {
            const value = resolveLoopExpr(expr, loopVar, item);
            return value === undefined ? match : String(value).toUpperCase();
        })
        .replace(/\$\{\{\s*([\w.]+)\s*\}\}/g, (match, expr) => {
            const value = resolveLoopExpr(expr, loopVar, item);
            return value === undefined ? match : String(value);
        });

}

function deepSubstitute(node, loopVar, item) {

    if (typeof node === "string") return substituteLoopVars(node, loopVar, item);

    if (Array.isArray(node)) return node.map((entry) => deepSubstitute(entry, loopVar, item));

    if (node && typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            out[substituteLoopVars(key, loopVar, item)] = deepSubstitute(value, loopVar, item);
        }
        return out;
    }

    return node;

}

// A small recursive-descent evaluator for the subset of Azure DevOps
// template-expression syntax actually seen in real "${{ if ... }}:"
// conditions: eq/ne/and/or/not/in/notIn calls over string/bool/number
// literals and dotted identifiers. Resolves each identifier against
// what a static preview can actually know — the current each-loop
// item's fields, and every declared parameter's default value — the
// same "decide it now using what's knowable" approach the old loop-
// source/in() check already used for its one narrow case, generalized
// instead of pattern-matched with single-purpose regexes (which
// produced the WRONG answer, not just no answer, for anything wrapped
// in not(...), and no answer at all for eq()/ne() or a bare boolean
// parameter — all of which show up in real pipelines that pick one of
// several near-identical blocks via "${{ if eq(item.field,
// parameters.someChoice) }}:").
//
// Returns true/false when the whole expression is decidable, or
// undefined when some part of it depends on something a static preview
// can't know (a pipeline variable, a runtime output, an unparseable
// expression) — undefined means "don't decide, fall back to showing it
// as skippable" (see expandIfMatch).
function evaluateCondition(conditionText, loopVar, loopItem, paramsMap) {

    const text = conditionText.trim();
    let pos = 0;

    function skipWs() {
        while (pos < text.length && /\s/.test(text[pos])) pos++;
    }

    function parseValue() {

        skipWs();

        if (text[pos] === "'") {

            pos++;
            let value = "";

            while (pos < text.length && text[pos] !== "'") {
                value += text[pos];
                pos++;
            }

            pos++; // closing quote
            return value;

        }

        const identMatch = /^[A-Za-z_][\w.]*/.exec(text.slice(pos));

        if (identMatch) {
            return parseIdentifierOrCall(identMatch[0]);
        }

        const boolMatch = /^(true|false)\b/i.exec(text.slice(pos));

        if (boolMatch) {
            pos += boolMatch[0].length;
            return boolMatch[0].toLowerCase() === "true";
        }

        const numMatch = /^-?\d+(\.\d+)?/.exec(text.slice(pos));

        if (numMatch) {
            pos += numMatch[0].length;
            return Number(numMatch[0]);
        }

        return undefined;

    }

    function parseIdentifierOrCall(ident) {

        const afterIdentPos = pos + ident.length;
        let lookaheadPos = afterIdentPos;

        while (lookaheadPos < text.length && /\s/.test(text[lookaheadPos])) lookaheadPos++;

        // A bare identifier followed by "(" — not a dotted path like
        // "project.name" — is a function call (eq/ne/and/or/not/in/notIn).
        if (text[lookaheadPos] === "(" && /^[A-Za-z_]\w*$/.test(ident)) {
            pos = lookaheadPos + 1;
            return applyFunction(ident, parseArgs());
        }

        pos = afterIdentPos;
        return resolveIdentifier(ident);

    }

    function parseArgs() {

        const args = [];

        skipWs();

        if (text[pos] !== ")") {

            args.push(parseValue());
            skipWs();

            while (text[pos] === ",") {
                pos++;
                args.push(parseValue());
                skipWs();
            }

        }

        skipWs();
        if (text[pos] === ")") pos++;

        return args;

    }

    function resolveIdentifier(ident) {

        if (loopVar && ident === loopVar) return loopItem;

        if (loopVar && ident.startsWith(`${loopVar}.`)) {

            const path = ident.slice(loopVar.length + 1).split(".");
            let value = loopItem;

            for (const key of path) {
                if (value == null) return undefined;
                value = value[key];
            }

            return value;

        }

        if (ident.startsWith("parameters.")) {
            const name = ident.slice("parameters.".length);
            return Object.prototype.hasOwnProperty.call(paramsMap, name) ? paramsMap[name] : undefined;
        }

        // variables.*, job/stage outputs, etc. — genuinely only known at
        // real run time, not something this static preview can resolve.
        return undefined;

    }

    function applyFunction(name, args) {

        switch (name.toLowerCase()) {

            case "eq":
                if (args.length !== 2 || args.some((a) => a === undefined)) return undefined;
                return String(args[0]) === String(args[1]);

            case "ne":
                if (args.length !== 2 || args.some((a) => a === undefined)) return undefined;
                return String(args[0]) !== String(args[1]);

            case "not":
                if (args.length !== 1 || args[0] === undefined) return undefined;
                return !args[0];

            case "in":
                if (args.length < 1 || args[0] === undefined) return undefined;
                return args.slice(1).some((v) => String(v) === String(args[0]));

            case "notin":
                if (args.length < 1 || args[0] === undefined) return undefined;
                return !args.slice(1).some((v) => String(v) === String(args[0]));

            // and()/or() use three-valued logic (like SQL NULL) rather than
            // bailing out on the first unknown operand: "and(false, X)" is
            // decidably false and "or(true, X)" is decidably true no matter
            // what the undecidable X turns out to be.
            case "and":
                if (args.some((a) => a === false)) return false;
                if (args.some((a) => a === undefined)) return undefined;
                return args.every(Boolean);

            case "or":
                if (args.some((a) => a === true)) return true;
                if (args.some((a) => a === undefined)) return undefined;
                return args.some(Boolean);

            default:
                return undefined;

        }

    }

    return parseValue();

}

function resolveIfConditionRefs(conditionText, loopVar, loopItem) {

    return conditionText
        .replace(/parameters\[\s*format\(\s*'([^']*)'\s*,\s*([\w.]+)\s*\)\s*\]/g, (match, fmt, expr) => {
            const value = loopVar ? resolveLoopExpr(expr, loopVar, loopItem) : undefined;
            return value === undefined ? match : `{{param:${fmt.replace("{0}", String(value))}}}`;
        })
        .replace(/parameters\.(\w+)/g, (match, name) => `{{param:${name}}}`);

}

// The one key of a single-key mapping entry (an each-loop or if-block
// marker is always written as a lone "${{ ... }}:" key with the loop/if
// body as its value) — null for anything else, which just means "not one
// of those two special forms".
function soleKeyOf(entry) {
    return entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 1
        ? Object.keys(entry)[0]
        : null;
}

// eachMatch's loop body, one expansion per source item — null when the
// loop source isn't a fixed array (e.g. only known at run time), which
// tells expandEntry to fall back to treating the entry as ordinary.
function expandEachMatch(eachMatch, body, doc, paramsMap) {

    const [, newLoopVar, path] = eachMatch;
    const source = resolveLoopSource(path, paramsMap);

    if (!Array.isArray(source)) return null;

    const result = [];

    source.forEach((sourceItem) => {

        const substituted = deepSubstitute(body, newLoopVar, sourceItem);
        const expanded = expandEachLoops(substituted, doc, paramsMap, newLoopVar, sourceItem);

        if (Array.isArray(expanded)) result.push(...expanded);
        else result.push(expanded);

    });

    return result;

}

// ifMatch's body — dropped entirely when the condition is decidably
// false (e.g. "eq(project.name, parameters.apiToDeploy)" for every
// project but the selected one), included with no runtime marker at all
// when decidably true, and otherwise expanded with the condition text
// attached to each resulting item so the existing referencedParams skip
// mechanism picks it up — a job nested inside "${{ each project }}: ${{
// if <undecidable> }}:" ends up with exactly the same skip behavior as
// one with a plain "condition: eq('${{ parameters.deploy_X }}', 'True')"
// field.
function expandIfMatch(ifMatch, body, doc, paramsMap, loopVar, loopItem) {

    const decision = evaluateCondition(ifMatch[1], loopVar, loopItem, paramsMap);

    if (decision === false) {
        return [];
    }

    const expanded = expandEachLoops(body, doc, paramsMap, loopVar, loopItem);
    const bodyArray = Array.isArray(expanded) ? expanded : [expanded];

    if (decision !== true) {

        const conditionText = resolveIfConditionRefs(ifMatch[1], loopVar, loopItem);

        bodyArray.forEach((item) => {

            if (item && typeof item === "object" && !Array.isArray(item)) {
                item.condition = item.condition ? `${item.condition} ${conditionText}` : conditionText;
            }

        });

    }

    return bodyArray;

}

// The zero-or-more expanded items a single node-array entry produces: an
// each-loop entry expands to one item per source element, an if-block
// entry expands to its (possibly empty) body, and an ordinary entry just
// expands to itself.
function expandEntry(entry, doc, paramsMap, loopVar, loopItem) {

    const soleKey = soleKeyOf(entry);
    const eachMatch = soleKey ? soleKey.match(EACH_LOOP_KEY) : null;

    if (eachMatch) {
        const expanded = expandEachMatch(eachMatch, entry[soleKey], doc, paramsMap);
        if (expanded) return expanded;
    }

    const ifMatch = !eachMatch && soleKey ? soleKey.match(IF_BLOCK_KEY) : null;

    if (ifMatch) {
        return expandIfMatch(ifMatch, entry[soleKey], doc, paramsMap, loopVar, loopItem);
    }

    return [expandEachLoops(entry, doc, paramsMap, loopVar, loopItem)];

}

// loopVar/loopItem carry the enclosing each-loop's binding (if any) down
// into nested "${{ if }}:" blocks, which commonly sit directly inside an
// each-loop's body and reference the loop item in their condition (e.g.
// "${{ if eq(parameters[format('deploy_{0}', project.name)], true) }}").
function expandEachLoops(node, doc, paramsMap, loopVar = null, loopItem = null) {

    if (Array.isArray(node)) {
        return node.flatMap((entry) => expandEntry(entry, doc, paramsMap, loopVar, loopItem));
    }

    if (node && typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            out[key] = expandEachLoops(value, doc, paramsMap, loopVar, loopItem);
        }
        return out;
    }

    return node;

}

function firstLine(text) {
    const line = String(text).trim().split("\n")[0];
    return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}

// Kahn's algorithm, grouped into layers instead of a flat order — a job
// lands in the earliest layer where every one of its dependencies has
// already been placed in an earlier layer.
function computeLayers(jobs) {

    const byId = new Map(jobs.map((job) => [job.id, job]));
    const remaining = new Set(jobs.map((job) => job.id));
    const placed = new Set();
    const layers = [];

    while (remaining.size > 0) {

        const layer = [];

        for (const id of remaining) {
            const job = byId.get(id);
            if (job.needs.every((dep) => placed.has(dep))) {
                layer.push(id);
            }
        }

        if (layer.length === 0) {
            throw new Error("Circular dependency detected — can't determine a run order.");
        }

        layer.forEach((id) => {
            remaining.delete(id);
            placed.add(id);
        });

        layers.push(layer);

    }

    return layers;

}
