using System.Text.RegularExpressions;

namespace DeploymentAPI.Helpers;

// Starter HCL for the "no existing target fits" add-resource flow (see
// TerraformController.GenerateTemplate's own comment) - deliberately NOT
// fully wired to the project's own existing Resource Group/Plan naming,
// since this app can't safely infer that from a text scan alone. Every
// template only ever REFERENCES an existing resource group
// (module.resource_group.name/.location) - it never declares a new
// azurerm_resource_group, so "Generate Template" can't accidentally spin up
// a second resource group next to the project's real one.
//
// Each kind is a real module: the calling block appended to main.tf
// (MainTfBlock) references "./modules/<kind>", and ModuleMainTf is that
// module's own self-contained main.tf (its variables, its resource(s), its
// outputs) - written out by the caller (TerraformController.GenerateTemplate)
// ONLY when modules/<kind>/main.tf doesn't already exist in the project, so
// an existing real module (e.g. this project's own uploaded modules/web_app)
// is never overwritten. This mirrors the exact module shapes
// TerraformResourceExtractor already knows how to read back (module-level
// for_each for web app; a non-for_each'd module whose own for_each'd
// resource is resolved one hop through its "queues" argument for service
// bus - see BuildAddTargets's own comment) - a project built purely from
// these starter templates is immediately usable by "Add Resource" too, not
// just a one-off insert.
public static class TerraformNewResourceTemplates
{
    public sealed record Template(
        string MainTfBlock,
        string VariableBlock,
        string TfvarsBlock,
        string ModuleFolder,
        string ModuleMainTf);

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
            # (existing Resource Group reference, Plan SKU) before running
            # Plan. Add more entries to {{varName}} in terraform.tfvars to add
            # more apps to this same group later.
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

        var moduleMainTf = """
            # Web app module - one call site per for_each key from the parent
            # module block. Self-contained: every argument comes from a
            # variable, nothing here assumes a specific project's own naming.
            variable "app_name" {
              type = string
            }

            variable "resource_group_name" {
              type = string
            }

            variable "location" {
              type = string
            }

            variable "service_plan_id" {
              type = string
            }

            variable "app_settings" {
              type    = map(string)
              default = {}
            }

            variable "connection_strings" {
              type    = map(string)
              default = {}
            }

            resource "azurerm_windows_web_app" "web_app" {
              name                = var.app_name
              resource_group_name = var.resource_group_name
              location            = var.location
              service_plan_id     = var.service_plan_id
              app_settings        = var.app_settings

              site_config {}

              dynamic "connection_string" {
                for_each = var.connection_strings
                content {
                  name  = connection_string.key
                  type  = "Custom"
                  value = connection_string.value
                }
              }
            }

            output "id" {
              value = azurerm_windows_web_app.web_app.id
            }

            output "default_hostname" {
              value = azurerm_windows_web_app.web_app.default_hostname
            }
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock, "modules/web_app", moduleMainTf);
    }

    private static Template BuildFunctionApp(string name, string safeVarName)
    {
        var varName = $"{safeVarName}_function_apps";

        var mainTf = $$"""
            # Starter template for a new function app group - review and
            # connect (existing Resource Group reference, storage account,
            # Plan) before running Plan. Each function app this creates also
            # gets its own Application Insights resource (see
            # modules/function_app/main.tf).
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

        var moduleMainTf = """
            # Function app module - bundles its own Application Insights
            # resource (one per function app, the common Azure pairing)
            # rather than requiring a separate "add Application Insights"
            # step. Uses classic (non-workspace-based) Application Insights -
            # if your subscription requires workspace-based App Insights,
            # add a "workspace_id" argument here pointing at your existing
            # Log Analytics Workspace before running Plan.
            variable "app_name" {
              type = string
            }

            variable "resource_group_name" {
              type = string
            }

            variable "location" {
              type = string
            }

            variable "service_plan_id" {
              type = string
            }

            variable "storage_account_name" {
              type = string
            }

            variable "storage_account_access_key" {
              type      = string
              sensitive = true
            }

            # Declared first (Terraform doesn't care about declaration order,
            # dependencies are resolved by reference either way) - this
            # module's PRIMARY resource is the function app, not its App
            # Insights companion; TerraformResourceExtractor.GuessPrimaryResourceType
            # takes whichever resource block appears first in the module's
            # own file as the resource type this module represents.
            resource "azurerm_windows_function_app" "function_app" {
              name                       = var.app_name
              resource_group_name        = var.resource_group_name
              location                   = var.location
              service_plan_id            = var.service_plan_id
              storage_account_name       = var.storage_account_name
              storage_account_access_key = var.storage_account_access_key

              app_settings = {
                APPINSIGHTS_INSTRUMENTATIONKEY        = azurerm_application_insights.insights.instrumentation_key
                APPLICATIONINSIGHTS_CONNECTION_STRING = azurerm_application_insights.insights.connection_string
              }

              site_config {}
            }

            resource "azurerm_application_insights" "insights" {
              name                = "appi-${var.app_name}"
              resource_group_name = var.resource_group_name
              location            = var.location
              application_type    = "web"
            }

            output "id" {
              value = azurerm_windows_function_app.function_app.id
            }

            output "application_insights_instrumentation_key" {
              value     = azurerm_application_insights.insights.instrumentation_key
              sensitive = true
            }
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock, "modules/function_app", moduleMainTf);
    }

    private static Template BuildServiceBusQueue(string name, string safeVarName)
    {
        var varName = $"{safeVarName}_queues";

        var mainTf = $$"""
            # Starter template for a new Service Bus queue group - review and
            # connect (existing Resource Group reference) before running
            # Plan. Add more entries to {{varName}} in terraform.tfvars to
            # add more queues to this same namespace later - this shape (a
            # module with no for_each of its own, whose queues resource
            # multiplies through the "queues" argument below) is exactly
            # what "Add Resource" already knows how to find and extend.
            module "{{safeVarName}}_service_bus" {
              source              = "./modules/servicebus"
              namespace_name      = "sb-{{name}}"
              resource_group_name = module.resource_group.name
              location            = module.resource_group.location
              queues              = var.{{varName}}
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

        var moduleMainTf = """
            # Service Bus module - one namespace, plus one queue per entry in
            # var.queues. The namespace itself is NOT for_each'd (there's
            # only ever one per module call); only the queue resource
            # multiplies - the same "Case B" shape TerraformResourceExtractor
            # resolves through this module's own "queues" argument.
            variable "namespace_name" {
              type = string
            }

            variable "resource_group_name" {
              type = string
            }

            variable "location" {
              type = string
            }

            variable "queues" {
              type    = list(string)
              default = []
            }

            resource "azurerm_servicebus_namespace" "namespace" {
              name                = var.namespace_name
              resource_group_name = var.resource_group_name
              location            = var.location
              sku                 = "Standard"
            }

            resource "azurerm_servicebus_queue" "queues" {
              for_each     = toset(var.queues)
              name         = each.key
              namespace_id = azurerm_servicebus_namespace.namespace.id
            }

            output "namespace_id" {
              value = azurerm_servicebus_namespace.namespace.id
            }
            """;

        return new Template(mainTf, variableBlock, tfvarsBlock, "modules/servicebus", moduleMainTf);
    }
}
