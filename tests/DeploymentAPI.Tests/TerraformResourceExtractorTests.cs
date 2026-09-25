using DeploymentAPI.DTOs;
using DeploymentAPI.Helpers;
using Xunit;

namespace DeploymentAPI.Tests;

public class TerraformResourceExtractorTests
{
    private static PersonalTerraformFileDetailDto File(string name, string content) => new()
    {
        FileName = name,
        Content = content,
        ContentLength = content.Length
    };

    [Fact]
    public void Extract_FindsALiteralDeclaredName()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  name     = "rg-example"
                  location = "eastus"
                }
                """)
        };

        var resources = TerraformResourceExtractor.Extract(files);

        var rg = Assert.Single(resources);
        Assert.Equal("azurerm_resource_group", rg.ResourceType);
        Assert.Equal("rg", rg.LocalName);
        Assert.Equal("rg-example", rg.DeclaredName);
    }

    [Fact]
    public void Extract_LeavesDeclaredNameNullForAVariableReference()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_service_plan" "plan" {
                  name = var.plan_name
                }
                """)
        };

        var resources = TerraformResourceExtractor.Extract(files);

        Assert.Null(Assert.Single(resources).DeclaredName);
    }

    [Fact]
    public void Extract_HandlesMultipleResourcesAndNestedBlocksWithoutMisreadingBoundaries()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_linux_web_app" "app" {
                  name = "app-example"

                  site_config {
                    always_on = true
                  }
                }

                resource "azurerm_servicebus_namespace" "sb" {
                  name = "sb-example"
                }
                """)
        };

        var resources = TerraformResourceExtractor.Extract(files);

        Assert.Equal(2, resources.Count);
        Assert.Equal("app-example", resources[0].DeclaredName);
        Assert.Equal("sb-example", resources[1].DeclaredName);
    }

    [Fact]
    public void Extract_IgnoresNonTerraformFiles()
    {
        var files = new[]
        {
            File("README.md", "resource \"azurerm_resource_group\" \"rg\" { name = \"x\" }")
        };

        Assert.Empty(TerraformResourceExtractor.Extract(files));
    }

    [Fact]
    public void Extract_ReturnsEmptyForAFileWithNoResourceBlocks()
    {
        var files = new[]
        {
            File("variables.tf", "variable \"location\" { type = string }")
        };

        Assert.Empty(TerraformResourceExtractor.Extract(files));
    }

    // The exact shape that prompted this: a single resource block with
    // for_each over a variable, resolved from an uploaded terraform.tfvars
    // - each entry's own nested `name = "..."` wins over the map key.
    [Fact]
    public void Extract_ResolvesForEachInstanceCountAndNamesFromTfvarsMap()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_windows_web_app" "this" {
                  for_each = var.web_apps
                  name     = each.value.name
                }
                """),
            File("terraform.tfvars", """
                web_apps = {
                  billing = {
                    name = "billing-app"
                    sku  = "B1"
                  }
                  reporting = {
                    name = "reporting-app"
                    sku  = "B1"
                  }
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.True(resource.HasForEachOrCount);
        Assert.Equal(2, resource.InstanceCount);
        Assert.Equal(new[] { "billing-app", "reporting-app" }, resource.InstanceNames);
    }

    // A map keyed by the app's own name, no nested name attribute - the key
    // itself is the name.
    [Fact]
    public void Extract_FallsBackToMapKeyWhenAnEntryHasNoNameAttribute()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_windows_web_app" "this" {
                  for_each = var.web_apps
                }
                """),
            File("terraform.tfvars", """
                web_apps = {
                  billing-app   = { sku = "B1" }
                  reporting-app = { sku = "B1" }
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.Equal(2, resource.InstanceCount);
        Assert.Equal(new[] { "billing-app", "reporting-app" }, resource.InstanceNames);
    }

    [Fact]
    public void Extract_ResolvesForEachOverAListOfPlainStrings()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  for_each = toset(var.regions)
                  name     = "rg-${each.value}"
                }
                """),
            File("terraform.tfvars", """
                regions = ["eastus", "westeurope", "southeastasia"]
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.Equal(3, resource.InstanceCount);
        Assert.Equal(new[] { "eastus", "westeurope", "southeastasia" }, resource.InstanceNames);
    }

    [Fact]
    public void Extract_ResolvesCountFromLengthOfATfvarsList()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_storage_account" "sa" {
                  count = length(var.storage_names)
                }
                """),
            File("terraform.tfvars", """
                storage_names = ["sa1", "sa2"]
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.True(resource.HasForEachOrCount);
        Assert.Equal(2, resource.InstanceCount);
        Assert.Null(resource.InstanceNames);
    }

    // A variable's own `default` in variables.tf is used when nothing in an
    // uploaded .tfvars overrides it.
    [Fact]
    public void Extract_FallsBackToAVariablesDefaultWhenNoTfvarsOverridesIt()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  for_each = var.regions
                }
                """),
            File("variables.tf", """
                variable "regions" {
                  type    = list(string)
                  default = ["eastus", "westus"]
                }
                """)
        };

        Assert.Equal(2, Assert.Single(TerraformResourceExtractor.Extract(files)).InstanceCount);
    }

    // tfvars overrides a variable's own default - Terraform's real
    // precedence, and this extractor's too.
    [Fact]
    public void Extract_PrefersTfvarsOverAVariablesDefault()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  for_each = var.regions
                }
                """),
            File("variables.tf", """
                variable "regions" {
                  default = ["eastus"]
                }
                """),
            File("terraform.tfvars", """
                regions = ["eastus", "westus", "northeurope"]
                """)
        };

        Assert.Equal(3, Assert.Single(TerraformResourceExtractor.Extract(files)).InstanceCount);
    }

    // for_each over something this app genuinely can't resolve (a local
    // value, not a variable) stays honestly unresolved rather than
    // guessing - HasForEachOrCount still flags that more than one instance
    // may exist.
    [Fact]
    public void Extract_LeavesInstanceCountNullWhenForEachSourceCannotBeResolved()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_windows_web_app" "this" {
                  for_each = local.computed_apps
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.True(resource.HasForEachOrCount);
        Assert.Null(resource.InstanceCount);
        Assert.Null(resource.InstanceNames);
    }

    [Fact]
    public void Extract_ReportsNoForEachOrCountForAPlainSingleResource()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  name = "rg-example"
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.False(resource.HasForEachOrCount);
        Assert.Null(resource.InstanceCount);
    }
}
