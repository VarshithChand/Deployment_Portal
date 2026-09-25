// Starter azurerm_* HCL blocks - pure text generation, inserted into
// whichever file is open in TerraformFilesSection's editor. Nothing here
// ever touches Azure; these are placeholder names/values for you to edit
// before running plan. Resource type names/arguments follow the
// AzureRM provider's modern (v3+) shape - the unified azurerm_service_plan
// resource rather than the deprecated azurerm_app_service_plan, Linux
// variants of Web App/Function App by default (swap in
// azurerm_windows_web_app / azurerm_windows_function_app if you need
// Windows instead).
export const TERRAFORM_RESOURCE_TEMPLATES = [
    {
        key: "resourceGroup",
        label: "Resource Group",
        hcl: `resource "azurerm_resource_group" "example" {
  name     = "rg-example"
  location = "eastus"
}
`
    },
    {
        key: "servicePlan",
        label: "App Service Plan",
        hcl: `resource "azurerm_service_plan" "example" {
  name                = "plan-example"
  resource_group_name = azurerm_resource_group.example.name
  location            = azurerm_resource_group.example.location
  os_type             = "Linux"
  sku_name            = "B1"
}
`
    },
    {
        key: "webApp",
        label: "Web App",
        hcl: `resource "azurerm_linux_web_app" "example" {
  name                = "app-example"
  resource_group_name = azurerm_resource_group.example.name
  location            = azurerm_resource_group.example.location
  service_plan_id     = azurerm_service_plan.example.id

  site_config {}
}
`
    },
    {
        key: "functionApp",
        label: "Function App",
        hcl: `resource "azurerm_storage_account" "example_func" {
  name                     = "stexamplefuncapp"
  resource_group_name      = azurerm_resource_group.example.name
  location                 = azurerm_resource_group.example.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_linux_function_app" "example" {
  name                       = "func-example"
  resource_group_name       = azurerm_resource_group.example.name
  location                   = azurerm_resource_group.example.location
  service_plan_id            = azurerm_service_plan.example.id
  storage_account_name       = azurerm_storage_account.example_func.name
  storage_account_access_key = azurerm_storage_account.example_func.primary_access_key

  site_config {}
}
`
    },
    {
        key: "serviceBus",
        label: "Service Bus",
        hcl: `resource "azurerm_servicebus_namespace" "example" {
  name                = "sb-example"
  resource_group_name = azurerm_resource_group.example.name
  location            = azurerm_resource_group.example.location
  sku                 = "Standard"
}

resource "azurerm_servicebus_queue" "example" {
  name         = "queue-example"
  namespace_id = azurerm_servicebus_namespace.example.id
}
`
    }
];
