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
