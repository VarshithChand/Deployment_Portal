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
}
