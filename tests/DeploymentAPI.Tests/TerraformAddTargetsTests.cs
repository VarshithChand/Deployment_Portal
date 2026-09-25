using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Xunit;

namespace DeploymentAPI.Tests;

public class TerraformAddTargetsTests
{
    private static PersonalTerraformFileDetailDto File(string name, string content) => new()
    {
        FileName = name,
        Content = content,
        ContentLength = content.Length
    };

    // Case A: two modules share one source folder (this project's own
    // web_app shape) - each is its own, separately addable target.
    [Fact]
    public void BuildAddTargets_FindsOneTargetPerModuleCallSharingAFolder()
    {
        var files = new[]
        {
            File("main.tf", """
                module "api_web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.api_web_apps
                }

                module "misc_web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.misc_web_apps
                }
                """),
            File("terraform.tfvars", """
                api_web_apps = {
                  api-a = {}
                }
                misc_web_apps = {
                  misc-a = {}
                  misc-b = {}
                }
                """),
            File("modules/web_app/main.tf", "resource \"azurerm_windows_web_app\" \"web_app\" { name = var.app_name }")
        };

        var targets = TerraformResourceExtractor.BuildAddTargets(files);

        Assert.Equal(2, targets.Count);
        Assert.All(targets, t => Assert.Equal("azurerm_windows_web_app", t.ResourceType));
        Assert.All(targets, t => Assert.Equal("Map", t.Shape));
        Assert.All(targets, t => Assert.Equal("terraform.tfvars", t.FileName));

        Assert.Equal(1, targets.Single(t => t.VariableName == "api_web_apps").ExistingCount);
        Assert.Equal(2, targets.Single(t => t.VariableName == "misc_web_apps").ExistingCount);
    }

    [Fact]
    public void BuildAddTargets_FindsAListShapedTarget()
    {
        var files = new[]
        {
            File("main.tf", """
                module "function_apps" {
                  source   = "./modules/function_app"
                  for_each = toset(var.function_apps)
                }
                """),
            File("terraform.tfvars", "function_apps = [\"fn-a\", \"fn-b\"]"),
            File("modules/function_app/main.tf", "resource \"azurerm_windows_function_app\" \"function_app\" { name = var.app_name }")
        };

        var target = Assert.Single(TerraformResourceExtractor.BuildAddTargets(files));

        Assert.Equal("List", target.Shape);
        Assert.Equal("function_apps", target.VariableName);
        Assert.Equal(2, target.ExistingCount);
    }

    // Case B: the real service bus shape - the multiplying for_each sits on
    // a resource INSIDE a module that itself has no for_each, resolved
    // through that module call's own argument passing.
    [Fact]
    public void BuildAddTargets_ResolvesThroughAModuleArgumentOneHop()
    {
        var files = new[]
        {
            File("main.tf", """
                module "servicebus" {
                  source = "./modules/servicebus"
                  queues = [for queue in var.servicebus_queues : "${queue}-${var.queue_suffix}"]
                }
                """),
            File("terraform.tfvars", """
                servicebus_queues = ["orders", "payments"]
                queue_suffix      = "01"
                """),
            File("modules/servicebus/main.tf", """
                resource "azurerm_servicebus_queue" "queues" {
                  for_each = toset(var.queues)
                  name     = each.key
                }
                """)
        };

        var target = Assert.Single(TerraformResourceExtractor.BuildAddTargets(files));

        Assert.Equal("azurerm_servicebus_queue", target.ResourceType);
        Assert.Equal("servicebus_queues", target.VariableName);
        Assert.Equal("List", target.Shape);
        Assert.Equal(2, target.ExistingCount);
    }

    [Fact]
    public void BuildAddTargets_ReturnsNothingForAModuleWithNoForEach()
    {
        var files = new[]
        {
            File("main.tf", """
                module "resource_group" {
                  source = "./modules/resource_group"
                  name   = "rg-example"
                }
                """),
            File("modules/resource_group/main.tf", "resource \"azurerm_resource_group\" \"rg\" { name = var.name }")
        };

        Assert.Empty(TerraformResourceExtractor.BuildAddTargets(files));
    }

    [Fact]
    public void BuildResourceInstances_FlattensEveryEntryAcrossEveryTarget()
    {
        var files = new[]
        {
            File("main.tf", """
                module "api_web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.api_web_apps
                }
                """),
            File("terraform.tfvars", """
                api_web_apps = {
                  "app-a" = {}
                  "app-b" = { appsettings_file = "x.json" }
                }
                """),
            File("modules/web_app/main.tf", "resource \"azurerm_windows_web_app\" \"web_app\" { name = var.app_name }")
        };

        var instances = TerraformResourceExtractor.BuildResourceInstances(files);

        Assert.Equal(2, instances.Count);
        Assert.Contains(instances, i => i.Key == "app-a" && i.VariableName == "api_web_apps" && i.Shape == "Map");
        Assert.Contains(instances, i => i.Key == "app-b");
        Assert.All(instances, i => Assert.Equal("terraform.tfvars", i.FileName));
    }

    [Fact]
    public void BuildResourceInstances_PrefersANestedDeclaredNameOverTheMapKey()
    {
        var files = new[]
        {
            File("main.tf", """
                module "web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.web_apps
                }
                """),
            File("terraform.tfvars", """
                web_apps = {
                  billing = { name = "billing-app-01" }
                }
                """),
            File("modules/web_app/main.tf", "resource \"azurerm_windows_web_app\" \"web_app\" { name = var.app_name }")
        };

        var instance = Assert.Single(TerraformResourceExtractor.BuildResourceInstances(files));

        Assert.Equal("billing", instance.Key);
        Assert.Equal("billing-app-01", instance.DisplayName);
    }
}

public class TerraformTfvarsEditorRenameTests
{
    [Fact]
    public void RenameEntry_RenamesAMapKeyAndKeepsItsValueIntact()
    {
        var content = """
            resource_group_name = "cluster04"
            web_apps = {
              "old-name" = { appsettings_file = "x.json" }
              "other-app" = {}
            }
            """;

        var (success, error, updated) = TerraformTfvarsEditor.RenameEntry(content, "web_apps", "Map", "old-name", "new-name");

        Assert.True(success, error);
        Assert.Contains("\"new-name\" = { appsettings_file = \"x.json\" }", updated);
        Assert.DoesNotContain("\"old-name\"", updated);
        Assert.Contains("\"other-app\" = {}", updated); // untouched sibling
        Assert.Contains("resource_group_name = \"cluster04\"", updated); // untouched, unrelated variable
    }

    [Fact]
    public void RenameEntry_RenamesAListElement()
    {
        var content = "function_apps = [\n  \"old-fn\",\n  \"other-fn\"\n]";

        var (success, _, updated) = TerraformTfvarsEditor.RenameEntry(content, "function_apps", "List", "old-fn", "new-fn");

        Assert.True(success);
        Assert.Contains("\"new-fn\"", updated);
        Assert.DoesNotContain("\"old-fn\"", updated);
        Assert.Contains("\"other-fn\"", updated);
    }

    [Fact]
    public void RenameEntry_FailsCleanlyWhenTheOldKeyDoesNotExist()
    {
        var content = "web_apps = {\n  \"a\" = {}\n}";

        var (success, error, updated) = TerraformTfvarsEditor.RenameEntry(content, "web_apps", "Map", "does-not-exist", "new-name");

        Assert.False(success);
        Assert.NotNull(error);
        Assert.Null(updated);
    }

    [Fact]
    public void RenameEntry_FailsCleanlyWhenTheNewKeyAlreadyExists()
    {
        var content = "web_apps = {\n  \"a\" = {}\n  \"b\" = {}\n}";

        var (success, error, _) = TerraformTfvarsEditor.RenameEntry(content, "web_apps", "Map", "a", "b");

        Assert.False(success);
        Assert.Contains("already exists", error);
    }

    [Fact]
    public void RenameEntry_AllowsRenamingToTheSameNameAsANoOp()
    {
        var content = "web_apps = {\n  \"a\" = {}\n}";

        var (success, _, updated) = TerraformTfvarsEditor.RenameEntry(content, "web_apps", "Map", "a", "a");

        Assert.True(success);
        Assert.Contains("\"a\" = {}", updated);
    }
}

public class TerraformNewResourceTemplatesTests
{
    private static PersonalTerraformFileDetailDto File(string name, string content) => new()
    {
        FileName = name,
        Content = content,
        ContentLength = content.Length
    };

    // Every generated template must be immediately usable by "Add Resource"
    // too, not just a one-off insert - assembles a fake project exactly the
    // way GenerateTemplate would leave one (main.tf's calling block + the
    // module's own generated file + a starter tfvars entry) and confirms
    // BuildAddTargets finds it as a valid target of the right shape/
    // resource type. This is the real regression check for
    // TerraformNewResourceTemplates - if a generated module's shape ever
    // stops matching what the extractor understands, this catches it.
    [Theory]
    [InlineData("webApp", "azurerm_windows_web_app", "Map")]
    [InlineData("functionApp", "azurerm_windows_function_app", "List")]
    [InlineData("serviceBusQueue", "azurerm_servicebus_queue", "List")]
    public void GeneratedTemplate_IsImmediatelyUsableAsAnAddTarget(string kind, string expectedResourceType, string expectedShape)
    {
        var template = TerraformNewResourceTemplates.Build(kind, "myapp");
        Assert.NotNull(template);

        var files = new[]
        {
            File("main.tf", "module \"resource_group\" {\n  source = \"./modules/resource_group\"\n}\n\n" + template!.MainTfBlock),
            File("variables.tf", template.VariableBlock),
            File("terraform.tfvars", template.TfvarsBlock),
            File($"{template.ModuleFolder}/main.tf", template.ModuleMainTf)
        };

        var target = Assert.Single(TerraformResourceExtractor.BuildAddTargets(files));

        Assert.Equal(expectedResourceType, target.ResourceType);
        Assert.Equal(expectedShape, target.Shape);
        Assert.Equal(1, target.ExistingCount);
    }

    [Fact]
    public void BuildFunctionApp_BundlesItsOwnApplicationInsightsInsideTheModule()
    {
        var template = TerraformNewResourceTemplates.Build("functionApp", "myapp");

        Assert.NotNull(template);
        Assert.Contains("azurerm_application_insights", template!.ModuleMainTf);
    }

    [Theory]
    [InlineData("webApp")]
    [InlineData("functionApp")]
    [InlineData("serviceBusQueue")]
    public void EveryTemplate_OnlyReferencesAnExistingResourceGroupNeverCreatesOne(string kind)
    {
        var template = TerraformNewResourceTemplates.Build(kind, "myapp");

        Assert.NotNull(template);
        Assert.DoesNotContain("resource \"azurerm_resource_group\"", template!.MainTfBlock);
        Assert.DoesNotContain("resource \"azurerm_resource_group\"", template.ModuleMainTf);
        Assert.Contains("module.resource_group", template.MainTfBlock);
    }
}

public class TerraformTfvarsEditorRemoveTests
{
    [Fact]
    public void RemoveEntry_RemovesAMapKeyAndKeepsSiblingsIntact()
    {
        var content = """
            resource_group_name = "cluster04"
            web_apps = {
              "doomed-app" = { appsettings_file = "x.json" }
              "other-app" = {}
            }
            """;

        var (success, error, updated) = TerraformTfvarsEditor.RemoveEntry(content, "web_apps", "Map", "doomed-app");

        Assert.True(success, error);
        Assert.DoesNotContain("doomed-app", updated);
        Assert.Contains("\"other-app\" = {}", updated);
        Assert.Contains("resource_group_name = \"cluster04\"", updated);
    }

    [Fact]
    public void RemoveEntry_RemovesAListElement()
    {
        var content = "function_apps = [\n  \"doomed-fn\",\n  \"other-fn\"\n]";

        var (success, _, updated) = TerraformTfvarsEditor.RemoveEntry(content, "function_apps", "List", "doomed-fn");

        Assert.True(success);
        Assert.DoesNotContain("doomed-fn", updated);
        Assert.Contains("\"other-fn\"", updated);
    }

    [Fact]
    public void RemoveEntry_FailsCleanlyWhenTheKeyDoesNotExist()
    {
        var content = "web_apps = {\n  \"a\" = {}\n}";

        var (success, error, updated) = TerraformTfvarsEditor.RemoveEntry(content, "web_apps", "Map", "does-not-exist");

        Assert.False(success);
        Assert.NotNull(error);
        Assert.Null(updated);
    }

    [Fact]
    public void RemoveEntry_RemovingTheOnlyEntryLeavesAValidEmptyMap()
    {
        var content = "web_apps = {\n  \"a\" = {}\n}";

        var (success, _, updated) = TerraformTfvarsEditor.RemoveEntry(content, "web_apps", "Map", "a");

        Assert.True(success);
        Assert.DoesNotContain("\"a\"", updated);
        Assert.Contains("web_apps = {", updated);
    }
}

public class TerraformTfvarsEditorTests
{
    [Fact]
    public void InsertEntry_InsertsIntoAMapRightAfterTheOpeningBrace()
    {
        var content = """
            resource_group_name = "cluster04"
            web_apps = {
              "existing-app" = {}
            }
            """;

        var (success, error, updated) = TerraformTfvarsEditor.InsertEntry(content, "web_apps", "\"new-app\" = {}");

        Assert.True(success, error);
        Assert.Contains("web_apps = {\n  \"new-app\" = {}", updated);
        Assert.Contains("\"existing-app\" = {}", updated); // nothing lost
    }

    [Fact]
    public void InsertEntry_InsertsIntoAListRightAfterTheOpeningBracket()
    {
        var content = "function_apps = [\n  \"fn-a\"\n]";

        var (success, _, updated) = TerraformTfvarsEditor.InsertEntry(content, "function_apps", "\"fn-b\",");

        Assert.True(success);
        Assert.Contains("function_apps = [\n  \"fn-b\",", updated);
        Assert.Contains("\"fn-a\"", updated);
    }

    [Fact]
    public void InsertEntry_FailsCleanlyWhenTheVariableDoesNotExist()
    {
        var (success, error, updated) = TerraformTfvarsEditor.InsertEntry("region = \"eastus\"", "web_apps", "\"x\" = {}");

        Assert.False(success);
        Assert.NotNull(error);
        Assert.Null(updated);
    }

    [Fact]
    public void InsertEntry_FailsCleanlyForAScalarVariable()
    {
        var (success, error, _) = TerraformTfvarsEditor.InsertEntry("region = \"eastus\"", "region", "\"x\"");

        Assert.False(success);
        Assert.NotNull(error);
    }
}
