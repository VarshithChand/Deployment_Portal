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

    // The exact bug this session found: a `dynamic "x" { for_each = ... }`
    // sub-block sitting inside a resource that has NO for_each of its own
    // must never be read as if it belonged to the resource itself.
    [Fact]
    public void Extract_DoesNotMistakeADynamicBlocksForEachForTheResourcesOwn()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_windows_web_app" "web_app" {
                  name = var.app_name

                  dynamic "connection_string" {
                    for_each = var.connection_strings
                    content {
                      name  = connection_string.key
                      value = connection_string.value.value
                    }
                  }
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.False(resource.HasForEachOrCount);
        Assert.Null(resource.InstanceCount);
    }

    // A single module block with its own for_each, whose resources live in
    // a subfolder - the module's for_each is what multiplies them, not
    // anything inside the module's own .tf files.
    [Fact]
    public void Extract_PropagatesAModulesForEachToResourcesInsideItsSourceFolder()
    {
        var files = new[]
        {
            File("main.tf", """
                module "web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.web_apps
                  app_name = each.key
                }
                """),
            File("terraform.tfvars", """
                web_apps = {
                  billing   = {}
                  reporting = {}
                }
                """),
            File("modules/web_app/main.tf", """
                resource "azurerm_windows_web_app" "web_app" {
                  name = var.app_name
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.True(resource.HasForEachOrCount);
        Assert.Equal(2, resource.InstanceCount);
        Assert.Equal(new[] { "billing", "reporting" }, resource.InstanceNames);
    }

    // The exact real-world shape that prompted this: TWO separate module
    // blocks share the same source folder, each with their own for_each -
    // the resource inside that shared module gets created once per entry
    // across BOTH module calls combined, not just one of them.
    [Fact]
    public void Extract_SumsMultipleModuleCallsThatShareTheSameSourceFolder()
    {
        var files = new[]
        {
            File("main.tf", """
                module "api_web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.api_web_apps
                  app_name = each.key
                }

                module "miscellaneous_web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.miscellaneous_web_apps
                  app_name = each.key
                }
                """),
            File("terraform.tfvars", """
                api_web_apps = {
                  api-a = {}
                  api-b = {}
                }
                miscellaneous_web_apps = {
                  misc-a = {}
                }
                """),
            File("modules/web_app/main.tf", """
                resource "azurerm_windows_web_app" "web_app" {
                  name = var.app_name
                }

                resource "azurerm_windows_web_app_slot" "rc_slot" {
                  name = "rc"
                }
                """)
        };

        var resources = TerraformResourceExtractor.Extract(files);

        Assert.Equal(2, resources.Count);

        foreach (var resource in resources)
        {
            Assert.True(resource.HasForEachOrCount);
            Assert.Equal(3, resource.InstanceCount);
            Assert.Equal(new[] { "api-a", "api-b", "misc-a" }, resource.InstanceNames);
        }
    }

    // A `locals` value built as `for k, v in var.Y : k => {...}` has the
    // SAME KEYS as var.Y - resolving a module's for_each = local.X through
    // that idiom rather than leaving it unresolved.
    [Fact]
    public void Extract_ResolvesAModuleForEachThroughALocalsForInVarIdiom()
    {
        var files = new[]
        {
            File("main.tf", """
                locals {
                  api_web_apps_config = {
                    for app_name, config in var.api_web_apps : app_name => {
                      settings = config
                    }
                  }
                }

                module "api_web_apps" {
                  source   = "./modules/web_app"
                  for_each = local.api_web_apps_config
                  app_name = each.key
                }
                """),
            File("terraform.tfvars", """
                api_web_apps = {
                  api-a = { appsettings_file = "x.json" }
                  api-b = { appsettings_file = "y.json" }
                }
                """),
            File("modules/web_app/main.tf", """
                resource "azurerm_windows_web_app" "web_app" {
                  name = var.app_name
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.Equal(2, resource.InstanceCount);
        Assert.Equal(new[] { "api-a", "api-b" }, resource.InstanceNames);
    }

    // A module with no for_each/count at all is a single call - nothing
    // should be propagated to its resources, same as if there were no
    // module wrapping them at all.
    [Fact]
    public void Extract_DoesNotPropagateAnythingFromAModuleWithNoForEachOrCount()
    {
        var files = new[]
        {
            File("main.tf", """
                module "resource_group" {
                  source = "./modules/resource_group"
                  name   = "rg-example"
                }
                """),
            File("modules/resource_group/main.tf", """
                resource "azurerm_resource_group" "rg" {
                  name = var.name
                }
                """)
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.False(resource.HasForEachOrCount);
        Assert.Null(resource.InstanceCount);
    }

    // A root-level resource (not inside any module's source folder) is
    // never affected by an unrelated module's own for_each elsewhere in
    // the project.
    [Fact]
    public void Extract_LeavesRootLevelResourcesUnaffectedByAnUnrelatedModule()
    {
        var files = new[]
        {
            File("main.tf", """
                module "web_apps" {
                  source   = "./modules/web_app"
                  for_each = var.web_apps
                }

                resource "azurerm_resource_group" "rg" {
                  name = "rg-example"
                }
                """),
            File("terraform.tfvars", "web_apps = { a = {}, b = {}, c = {} }"),
            File("modules/web_app/main.tf", "resource \"azurerm_windows_web_app\" \"web_app\" { name = var.app_name }")
        };

        var resources = TerraformResourceExtractor.Extract(files);

        var rg = resources.Single(r => r.ResourceType == "azurerm_resource_group");
        Assert.False(rg.HasForEachOrCount);
        Assert.Null(rg.InstanceCount);

        var webApp = resources.Single(r => r.ResourceType == "azurerm_windows_web_app");
        Assert.Equal(3, webApp.InstanceCount);
    }

    // A real project's own .tfvars very commonly quotes map keys
    // ("app-name-with-dashes" = {...}), not just bare identifiers - found
    // live against a real file, where this silently resolved every such
    // map to zero entries.
    [Fact]
    public void Extract_ResolvesAModuleForEachOverAMapWithQuotedStringKeys()
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
                  "vcpms-app-cluster04-A" = {},
                  "vcpms-app-cluster04-B" = {}
                }
                """),
            File("modules/web_app/main.tf", "resource \"azurerm_windows_web_app\" \"web_app\" { name = var.app_name }")
        };

        var resource = Assert.Single(TerraformResourceExtractor.Extract(files));

        Assert.Equal(2, resource.InstanceCount);
        Assert.Equal(new[] { "vcpms-app-cluster04-A", "vcpms-app-cluster04-B" }, resource.InstanceNames);
    }

    // Blank lines and "# ..." comments between top-level .tfvars entries -
    // also found live: an earlier version of the scanner stopped dead at
    // the first comment, silently discarding every entry after it (here,
    // everything past "location").
    [Fact]
    public void Extract_SkipsCommentsBetweenTopLevelTfvarsEntries()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  for_each = var.regions
                }
                """),
            File("terraform.tfvars", """
                resource_group_name = "cluster04"
                location             = "West Europe"

                # Regions to deploy into
                regions = ["eastus", "westus"]
                """)
        };

        Assert.Equal(2, Assert.Single(TerraformResourceExtractor.Extract(files)).InstanceCount);
    }

    [Fact]
    public void Extract_SkipsSlashSlashAndBlockCommentsBetweenTopLevelEntries()
    {
        var files = new[]
        {
            File("main.tf", """
                resource "azurerm_resource_group" "rg" {
                  for_each = var.regions
                }
                """),
            File("terraform.tfvars", """
                // leading comment
                unused = "value"
                /* a block
                   comment */
                regions = ["eastus", "westus", "northeurope"]
                """)
        };

        Assert.Equal(3, Assert.Single(TerraformResourceExtractor.Extract(files)).InstanceCount);
    }
}
