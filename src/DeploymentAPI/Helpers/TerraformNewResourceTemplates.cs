using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Starter HCL for the "no existing target fits" add-resource flow (see
// TerraformController.GenerateTemplate's own comment) - deliberately NOT
// fully wired to the project's own existing Resource Group/Plan naming,
// since this app can't safely infer that from a text scan alone. Each
// template is self-contained (declares its own Service Plan, its own
// for_each-driven variable) so it's a genuine starting point rather than a
// half-wired block that references something that may not exist - the
// same "starter code, not a finished wire-up" posture as the file editor's
// own "Insert starter code" template picker, just parameterized by the
// requested name and shaped as a for_each collection instead of one
// resource.
public static class TerraformNewResourceTemplates
{
    public sealed record Template(string MainTfBlock, string VariableBlock, string TfvarsBlock);

    public static Template? Build(string kind, string name)
    {
        var safeVarName = SanitizeIdentifier(name);

        return kind switch
        {
            "webApp" => BuildWebApp(name, safeVarName),
            "functionApp" => BuildFunctionApp(name, safeVarName),
            "serviceBusQueue" => BuildServiceBusQueue(name, safeVarName),
            _ => null
        };
    }

    private static string SanitizeIdentifier(string name) =>
        Regex.Replace(name, @"[^A-Za-z0-9_]", "_").ToLowerInvariant();

    private static Template BuildWebApp(string name, string safeVarName)
    {
        var varName = $"{safeVarName}_web_apps";

        var mainTf = $$"""
            # Starter template for a new web app group - review and connect
            # (Resource Group reference, Plan SKU) before running Plan. Add
            # more entries to {{varName}} in terraform.tfvars to add more apps
            # to this same group later.
            resource "azurerm_service_plan" "{{safeVarName}}_plan" {
              name                = "ASP-{{name}}"
              location            = module.resource_group.location
              resource_group_name = module.resource_group.name
              os_type             = "Windows"
              sku_name            = "S1"
            }

            module "{{safeVarName}}_web_apps" {
              source              = "./modules/web_app"
              for_each            = var.{{varName}}
              app_name            = each.key
              resource_group_name = module.resource_group.name
              location            = module.resource_group.location
              service_plan_id     = azurerm_service_plan.{{safeVarName}}_plan.id
              app_settings        = try(each.value.app_settings, {})
              connection_strings  = try(each.value.connection_strings, {})
            }
            """;

        var variableBlock = $$"""
            variable "{{varName}}" {
              description = "Web apps created for {{name}}."
              type        = map(any)
              default     = {}
            }
            """;

        var tfvarsBlock = $$"""
            {{varName}} = {
              "{{name}}" = {}
            }
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock);
    }

    private static Template BuildFunctionApp(string name, string safeVarName)
    {
        var varName = $"{safeVarName}_function_apps";

        var mainTf = $$"""
            # Starter template for a new function app group - review and
            # connect (Resource Group reference, storage account, Plan) before
            # running Plan.
            resource "azurerm_storage_account" "{{safeVarName}}_storage" {
              name                     = "st{{safeVarName}}fn"
              resource_group_name      = module.resource_group.name
              location                 = module.resource_group.location
              account_tier             = "Standard"
              account_replication_type = "LRS"
            }

            resource "azurerm_service_plan" "{{safeVarName}}_plan" {
              name                = "ASP-{{name}}-consumption"
              location            = module.resource_group.location
              resource_group_name = module.resource_group.name
              os_type             = "Windows"
              sku_name            = "Y1"
            }

            module "{{safeVarName}}_function_apps" {
              source                     = "./modules/function_app"
              for_each                   = toset(var.{{varName}})
              app_name                   = each.value
              resource_group_name        = module.resource_group.name
              location                   = module.resource_group.location
              service_plan_id            = azurerm_service_plan.{{safeVarName}}_plan.id
              storage_account_name       = azurerm_storage_account.{{safeVarName}}_storage.name
              storage_account_access_key = azurerm_storage_account.{{safeVarName}}_storage.primary_access_key
            }
            """;

        var variableBlock = $$"""
            variable "{{varName}}" {
              description = "Function apps created for {{name}}."
              type        = list(string)
              default     = []
            }
            """;

        var tfvarsBlock = $$"""
            {{varName}} = [
              "{{name}}"
            ]
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock);
    }

    private static Template BuildServiceBusQueue(string name, string safeVarName)
    {
        var varName = $"{safeVarName}_queues";

        var mainTf = $$"""
            # Starter template for a new Service Bus queue group - review and
            # connect (namespace reference) before running Plan. If you
            # already have a Service Bus namespace, point namespace_id at it
            # instead of declaring a new one here.
            resource "azurerm_servicebus_namespace" "{{safeVarName}}_namespace" {
              name                = "sb-{{name}}"
              resource_group_name = module.resource_group.name
              location            = module.resource_group.location
              sku                 = "Standard"
            }

            resource "azurerm_servicebus_queue" "{{safeVarName}}_queues" {
              for_each     = toset(var.{{varName}})
              name         = each.key
              namespace_id = azurerm_servicebus_namespace.{{safeVarName}}_namespace.id
            }
            """;

        var variableBlock = $$"""
            variable "{{varName}}" {
              description = "Service Bus queues created for {{name}}."
              type        = list(string)
              default     = []
            }
            """;

        var tfvarsBlock = $$"""
            {{varName}} = [
              "{{name}}"
            ]
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock);
    }
}
