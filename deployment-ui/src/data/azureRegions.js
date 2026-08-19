// Common Azure regions, {value,label}-shaped for ComboBox (see
// components/common/ComboBox.jsx) - used by the Create VM form's location
// picker. Not exhaustive (Azure has 60+ regions, many with restricted
// availability) - same curated, not exhaustive, reasoning as
// data/awsRegions.js. A region typed that isn't in this list still works
// everywhere it's actually used, it just won't autocomplete.
const AZURE_REGIONS = [
    { value: "eastus", label: "East US" },
    { value: "eastus2", label: "East US 2" },
    { value: "westus", label: "West US" },
    { value: "westus2", label: "West US 2" },
    { value: "westus3", label: "West US 3" },
    { value: "centralus", label: "Central US" },
    { value: "southcentralus", label: "South Central US" },
    { value: "canadacentral", label: "Canada Central" },
    { value: "brazilsouth", label: "Brazil South" },
    { value: "northeurope", label: "North Europe" },
    { value: "westeurope", label: "West Europe" },
    { value: "uksouth", label: "UK South" },
    { value: "ukwest", label: "UK West" },
    { value: "francecentral", label: "France Central" },
    { value: "germanywestcentral", label: "Germany West Central" },
    { value: "switzerlandnorth", label: "Switzerland North" },
    { value: "swedencentral", label: "Sweden Central" },
    { value: "norwayeast", label: "Norway East" },
    { value: "southafricanorth", label: "South Africa North" },
    { value: "uaenorth", label: "UAE North" },
    { value: "centralindia", label: "Central India" },
    { value: "southindia", label: "South India" },
    { value: "eastasia", label: "East Asia" },
    { value: "southeastasia", label: "Southeast Asia" },
    { value: "japaneast", label: "Japan East" },
    { value: "japanwest", label: "Japan West" },
    { value: "koreacentral", label: "Korea Central" },
    { value: "australiaeast", label: "Australia East" },
    { value: "australiasoutheast", label: "Australia Southeast" }
];

export default AZURE_REGIONS;
