// The Azure service catalog behind Cloud Services' Azure sub-page - the
// Azure equivalent of data/awsServiceCatalog.js, same plain local data (not
// an API response - this never changes at runtime).
//
// `resourceType` is the ARM resource type this catalog entry corresponds
// to (e.g. "microsoft.compute/virtualmachines", always lowercase) - it's
// how utils/cloudServiceLiveStatus.js's getLiveStatusForAzureService
// matches a catalog entry to a group in the account-wide inventory (see
// settingsService.getMyAzureResources, grouped by ARM's own `type` field).
// Left undefined for entries that aren't a single ARM resource type at all
// (Azure AD, Cost Management, Azure Policy, Azure Advisor are portal
// features/blades, not resources a subscription "has" a list of) - those
// simply never show a live count, same honest gap AWS's own catalog has
// for services outside its 7 direct fields + tagging-API reach.
//
// consoleUrl for resource-typed entries uses Azure Portal's documented
// "browse by resource type" deep link (#blade/HubsExtension/BrowseResource/
// resourceType/{type}) - reliable because it's driven by the same ARM type
// string, not a guessed blade name. Entries with no resourceType link to
// the plain Azure Portal home instead of a guessed blade fragment - an
// honest fallback rather than a deep link that might not resolve.
//
// Every id below is referenced by other entries' relatedServices - keep
// ids stable, don't reuse one for a different service.

function browseResourceUrl(resourceType) {
    return `https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/${encodeURIComponent(resourceType)}`;
}

const PORTAL_HOME = "https://portal.azure.com/";

export const AZURE_CATEGORIES = [
    "Compute",
    "Containers",
    "Storage",
    "Database",
    "Networking",
    "Security",
    "Management",
    "Analytics",
    "Application Integration",
    "AI & ML",
    "Migration",
    "IoT"
];

const AZURE_SERVICES = [

    // ---------- Compute ----------
    {
        id: "virtual-machines",
        provider: "azure",
        name: "Virtual Machines",
        fullName: "Azure Virtual Machines",
        category: "Compute",
        description: "On-demand, scalable virtual servers in the cloud.",
        keywords: ["compute", "vm", "virtual machine", "server", "iaas"],
        resourceType: "microsoft.compute/virtualmachines",
        consoleUrl: browseResourceUrl("microsoft.compute/virtualmachines"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-machines/",
        commonUses: ["Web and application servers", "Lift-and-shift workloads", "Dev/test environments"],
        relatedServices: ["vm-scale-sets", "managed-disks", "virtual-network", "log-analytics"]
    },
    {
        id: "vm-scale-sets",
        provider: "azure",
        name: "VM Scale Sets",
        fullName: "Azure Virtual Machine Scale Sets",
        category: "Compute",
        description: "Deploy and manage a set of identical, auto-scaling VMs.",
        keywords: ["compute", "autoscale", "vm", "scale set"],
        resourceType: "microsoft.compute/virtualmachinescalesets",
        consoleUrl: browseResourceUrl("microsoft.compute/virtualmachinescalesets"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-machine-scale-sets/",
        commonUses: ["Auto-scaling compute tiers", "Large-scale batch workloads"],
        relatedServices: ["virtual-machines", "load-balancer"]
    },
    {
        id: "app-service",
        provider: "azure",
        name: "App Service",
        fullName: "Azure App Service",
        category: "Compute",
        description: "Fully managed platform for building and hosting web apps and APIs.",
        keywords: ["compute", "paas", "web app", "api"],
        resourceType: "microsoft.web/sites",
        consoleUrl: browseResourceUrl("microsoft.web/sites"),
        documentationUrl: "https://learn.microsoft.com/azure/app-service/",
        commonUses: ["Web app hosting", "REST APIs", "Managed app environments"],
        relatedServices: ["app-service-plans", "application-insights", "sql-database"]
    },
    {
        id: "app-service-plans",
        provider: "azure",
        name: "App Service Plans",
        fullName: "Azure App Service Plans",
        category: "Compute",
        description: "The compute resources (tier, region, scale) an App Service runs on.",
        keywords: ["compute", "paas", "hosting plan"],
        resourceType: "microsoft.web/serverfarms",
        consoleUrl: browseResourceUrl("microsoft.web/serverfarms"),
        documentationUrl: "https://learn.microsoft.com/azure/app-service/overview-hosting-plans",
        commonUses: ["Sizing and scaling App Service"],
        relatedServices: ["app-service"]
    },
    {
        id: "azure-functions",
        provider: "azure",
        name: "Functions",
        fullName: "Azure Functions",
        category: "Compute",
        description: "Event-driven serverless compute - run code without managing servers.",
        keywords: ["compute", "serverless", "function", "faas"],
        resourceType: "microsoft.web/sites",
        consoleUrl: browseResourceUrl("microsoft.web/sites"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-functions/",
        commonUses: ["Event-driven backends", "Scheduled jobs", "Webhook handlers"],
        relatedServices: ["event-grid", "service-bus", "logic-apps"]
    },
    {
        id: "azure-batch",
        provider: "azure",
        name: "Batch",
        fullName: "Azure Batch",
        category: "Compute",
        description: "Cloud-scale job scheduling and compute management for parallel workloads.",
        keywords: ["compute", "hpc", "batch", "parallel"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/batch/",
        commonUses: ["Large-scale parallel processing", "Rendering pipelines"],
        relatedServices: ["virtual-machines"]
    },

    // ---------- Containers ----------
    {
        id: "container-registry",
        provider: "azure",
        name: "Container Registry",
        fullName: "Azure Container Registry",
        category: "Containers",
        description: "Managed, private Docker registry for container images and artifacts.",
        keywords: ["containers", "docker", "registry", "images"],
        resourceType: "microsoft.containerregistry/registries",
        consoleUrl: browseResourceUrl("microsoft.containerregistry/registries"),
        documentationUrl: "https://learn.microsoft.com/azure/container-registry/",
        commonUses: ["Storing container images", "CI/CD image pipelines"],
        relatedServices: ["aks", "container-instances"]
    },
    {
        id: "aks",
        provider: "azure",
        name: "AKS",
        fullName: "Azure Kubernetes Service",
        category: "Containers",
        description: "Managed Kubernetes cluster hosting and orchestration.",
        keywords: ["containers", "kubernetes", "k8s", "orchestration"],
        resourceType: "microsoft.containerservice/managedclusters",
        consoleUrl: browseResourceUrl("microsoft.containerservice/managedclusters"),
        documentationUrl: "https://learn.microsoft.com/azure/aks/",
        commonUses: ["Microservices orchestration", "Kubernetes workloads"],
        relatedServices: ["container-registry", "virtual-network", "log-analytics"]
    },
    {
        id: "container-instances",
        provider: "azure",
        name: "Container Instances",
        fullName: "Azure Container Instances",
        category: "Containers",
        description: "Run single containers without managing servers or orchestrators.",
        keywords: ["containers", "aci", "docker", "serverless containers"],
        resourceType: "microsoft.containerinstance/containergroups",
        consoleUrl: browseResourceUrl("microsoft.containerinstance/containergroups"),
        documentationUrl: "https://learn.microsoft.com/azure/container-instances/",
        commonUses: ["Quick container jobs", "Burst compute for AKS"],
        relatedServices: ["container-registry", "aks"]
    },
    {
        id: "container-apps",
        provider: "azure",
        name: "Container Apps",
        fullName: "Azure Container Apps",
        category: "Containers",
        description: "Serverless containers with built-in autoscaling, revisions, and Dapr support.",
        keywords: ["containers", "serverless", "microservices"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/container-apps/",
        commonUses: ["Microservices without cluster management", "Event-driven container apps"],
        relatedServices: ["container-registry", "aks"]
    },

    // ---------- Storage ----------
    {
        id: "storage-accounts",
        provider: "azure",
        name: "Storage Accounts",
        fullName: "Azure Storage Accounts",
        category: "Storage",
        description: "Blob, file, queue, and table storage in a single managed account.",
        keywords: ["storage", "blob", "files", "queue", "table"],
        resourceType: "microsoft.storage/storageaccounts",
        consoleUrl: browseResourceUrl("microsoft.storage/storageaccounts"),
        documentationUrl: "https://learn.microsoft.com/azure/storage/",
        commonUses: ["Object storage", "Static website hosting", "File shares", "Backups"],
        relatedServices: ["managed-disks", "cdn"]
    },
    {
        id: "managed-disks",
        provider: "azure",
        name: "Managed Disks",
        fullName: "Azure Managed Disks",
        category: "Storage",
        description: "Block-level storage volumes for virtual machines.",
        keywords: ["storage", "disk", "block storage", "vm"],
        resourceType: "microsoft.compute/disks",
        consoleUrl: browseResourceUrl("microsoft.compute/disks"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-machines/managed-disks-overview",
        commonUses: ["VM OS and data disks", "Snapshots and backups"],
        relatedServices: ["virtual-machines"]
    },

    // ---------- Database ----------
    {
        id: "sql-database",
        provider: "azure",
        name: "SQL Database",
        fullName: "Azure SQL Database",
        category: "Database",
        description: "Fully managed relational database built on the SQL Server engine.",
        keywords: ["database", "sql", "relational", "rdbms"],
        resourceType: "microsoft.sql/servers/databases",
        consoleUrl: browseResourceUrl("microsoft.sql/servers/databases"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-sql/database/",
        commonUses: ["Application databases", "Managed relational storage"],
        relatedServices: ["sql-servers", "cosmos-db"]
    },
    {
        id: "sql-servers",
        provider: "azure",
        name: "SQL Servers",
        fullName: "Azure SQL logical server",
        category: "Database",
        description: "The logical server that hosts one or more Azure SQL databases.",
        keywords: ["database", "sql", "server"],
        resourceType: "microsoft.sql/servers",
        consoleUrl: browseResourceUrl("microsoft.sql/servers"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-sql/database/logical-servers",
        commonUses: ["Hosting SQL databases", "Firewall and access control for SQL DBs"],
        relatedServices: ["sql-database"]
    },
    {
        id: "cosmos-db",
        provider: "azure",
        name: "Cosmos DB",
        fullName: "Azure Cosmos DB",
        category: "Database",
        description: "Globally distributed, multi-model NoSQL database.",
        keywords: ["database", "nosql", "cosmos", "document db"],
        resourceType: "microsoft.documentdb/databaseaccounts",
        consoleUrl: browseResourceUrl("microsoft.documentdb/databaseaccounts"),
        documentationUrl: "https://learn.microsoft.com/azure/cosmos-db/",
        commonUses: ["Globally distributed apps", "Document/JSON storage", "IoT telemetry"],
        relatedServices: ["sql-database"]
    },
    {
        id: "mysql-flexible",
        provider: "azure",
        name: "Database for MySQL",
        fullName: "Azure Database for MySQL - Flexible Server",
        category: "Database",
        description: "Managed MySQL database with high availability and built-in tuning.",
        keywords: ["database", "mysql", "relational"],
        resourceType: "microsoft.dbformysql/flexibleservers",
        consoleUrl: browseResourceUrl("microsoft.dbformysql/flexibleservers"),
        documentationUrl: "https://learn.microsoft.com/azure/mysql/",
        commonUses: ["MySQL-compatible application databases"],
        relatedServices: ["postgresql-flexible"]
    },
    {
        id: "postgresql-flexible",
        provider: "azure",
        name: "Database for PostgreSQL",
        fullName: "Azure Database for PostgreSQL - Flexible Server",
        category: "Database",
        description: "Managed PostgreSQL database with high availability and built-in tuning.",
        keywords: ["database", "postgres", "postgresql", "relational"],
        resourceType: "microsoft.dbforpostgresql/flexibleservers",
        consoleUrl: browseResourceUrl("microsoft.dbforpostgresql/flexibleservers"),
        documentationUrl: "https://learn.microsoft.com/azure/postgresql/",
        commonUses: ["PostgreSQL-compatible application databases"],
        relatedServices: ["mysql-flexible"]
    },
    {
        id: "azure-cache-redis",
        provider: "azure",
        name: "Cache for Redis",
        fullName: "Azure Cache for Redis",
        category: "Database",
        description: "Managed in-memory data store for caching and messaging.",
        keywords: ["database", "cache", "redis", "in-memory"],
        resourceType: "microsoft.cache/redis",
        consoleUrl: browseResourceUrl("microsoft.cache/redis"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-cache-for-redis/",
        commonUses: ["Session caching", "Pub/sub messaging", "Rate limiting"],
        relatedServices: ["sql-database"]
    },

    // ---------- Networking ----------
    {
        id: "virtual-network",
        provider: "azure",
        name: "Virtual Network",
        fullName: "Azure Virtual Network",
        category: "Networking",
        description: "Private, isolated network for your Azure resources.",
        keywords: ["networking", "vnet", "network"],
        resourceType: "microsoft.network/virtualnetworks",
        consoleUrl: browseResourceUrl("microsoft.network/virtualnetworks"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-network/",
        commonUses: ["Isolating workloads", "Connecting VMs and services"],
        relatedServices: ["network-security-groups", "load-balancer"]
    },
    {
        id: "network-security-groups",
        provider: "azure",
        name: "Network Security Groups",
        fullName: "Azure Network Security Groups",
        category: "Networking",
        description: "Filter network traffic to and from Azure resources.",
        keywords: ["networking", "nsg", "firewall", "security"],
        resourceType: "microsoft.network/networksecuritygroups",
        consoleUrl: browseResourceUrl("microsoft.network/networksecuritygroups"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview",
        commonUses: ["Restricting inbound/outbound traffic"],
        relatedServices: ["virtual-network", "azure-firewall"]
    },
    {
        id: "public-ip",
        provider: "azure",
        name: "Public IP Addresses",
        fullName: "Azure Public IP Addresses",
        category: "Networking",
        description: "Static or dynamic public IP addresses for Azure resources.",
        keywords: ["networking", "ip", "public ip"],
        resourceType: "microsoft.network/publicipaddresses",
        consoleUrl: browseResourceUrl("microsoft.network/publicipaddresses"),
        documentationUrl: "https://learn.microsoft.com/azure/virtual-network/ip-services/public-ip-addresses",
        commonUses: ["Internet-facing VMs and load balancers"],
        relatedServices: ["load-balancer", "virtual-machines"]
    },
    {
        id: "load-balancer",
        provider: "azure",
        name: "Load Balancer",
        fullName: "Azure Load Balancer",
        category: "Networking",
        description: "Layer 4 load balancing for high availability and scale.",
        keywords: ["networking", "load balancer", "lb"],
        resourceType: "microsoft.network/loadbalancers",
        consoleUrl: browseResourceUrl("microsoft.network/loadbalancers"),
        documentationUrl: "https://learn.microsoft.com/azure/load-balancer/",
        commonUses: ["Distributing traffic across VMs", "High availability"],
        relatedServices: ["virtual-machines", "vm-scale-sets"]
    },
    {
        id: "application-gateway",
        provider: "azure",
        name: "Application Gateway",
        fullName: "Azure Application Gateway",
        category: "Networking",
        description: "Layer 7 load balancer with web application firewall.",
        keywords: ["networking", "waf", "layer 7", "gateway"],
        resourceType: "microsoft.network/applicationgateways",
        consoleUrl: browseResourceUrl("microsoft.network/applicationgateways"),
        documentationUrl: "https://learn.microsoft.com/azure/application-gateway/",
        commonUses: ["HTTP(S) load balancing", "Web application firewall"],
        relatedServices: ["load-balancer", "front-door"]
    },
    {
        id: "azure-dns",
        provider: "azure",
        name: "DNS",
        fullName: "Azure DNS",
        category: "Networking",
        description: "Host and manage DNS domains using Azure infrastructure.",
        keywords: ["networking", "dns", "domain"],
        resourceType: "microsoft.network/dnszones",
        consoleUrl: browseResourceUrl("microsoft.network/dnszones"),
        documentationUrl: "https://learn.microsoft.com/azure/dns/",
        commonUses: ["Domain name resolution", "DNS record management"],
        relatedServices: ["front-door", "cdn"]
    },
    {
        id: "azure-firewall",
        provider: "azure",
        name: "Firewall",
        fullName: "Azure Firewall",
        category: "Networking",
        description: "Managed, cloud-native network firewall and threat protection.",
        keywords: ["networking", "firewall", "security"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/firewall/",
        commonUses: ["Centralized network security policy", "Threat filtering"],
        relatedServices: ["virtual-network", "network-security-groups"]
    },
    {
        id: "cdn",
        provider: "azure",
        name: "Content Delivery Network",
        fullName: "Azure Content Delivery Network",
        category: "Networking",
        description: "Cache content at edge locations closer to users.",
        keywords: ["networking", "cdn", "cache", "edge"],
        resourceType: "microsoft.cdn/profiles",
        consoleUrl: browseResourceUrl("microsoft.cdn/profiles"),
        documentationUrl: "https://learn.microsoft.com/azure/cdn/",
        commonUses: ["Static asset delivery", "Video streaming", "Reducing origin load"],
        relatedServices: ["storage-accounts", "front-door"]
    },
    {
        id: "front-door",
        provider: "azure",
        name: "Front Door",
        fullName: "Azure Front Door",
        category: "Networking",
        description: "Global, scalable entry point using Microsoft's edge network.",
        keywords: ["networking", "cdn", "global load balancer", "waf"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/frontdoor/",
        commonUses: ["Global HTTP load balancing", "Edge acceleration"],
        relatedServices: ["cdn", "application-gateway"]
    },

    // ---------- Security ----------
    {
        id: "key-vault",
        provider: "azure",
        name: "Key Vault",
        fullName: "Azure Key Vault",
        category: "Security",
        description: "Securely store and access secrets, keys, and certificates.",
        keywords: ["security", "secrets", "keys", "certificates"],
        resourceType: "microsoft.keyvault/vaults",
        consoleUrl: browseResourceUrl("microsoft.keyvault/vaults"),
        documentationUrl: "https://learn.microsoft.com/azure/key-vault/",
        commonUses: ["API keys and connection strings", "TLS certificates", "Encryption keys"],
        relatedServices: ["app-service", "virtual-machines"]
    },
    {
        id: "microsoft-entra-id",
        provider: "azure",
        name: "Microsoft Entra ID",
        fullName: "Microsoft Entra ID (Azure Active Directory)",
        category: "Security",
        description: "Cloud identity and access management for users and applications.",
        keywords: ["security", "identity", "azure ad", "entra", "sso"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/entra/fundamentals/",
        commonUses: ["Single sign-on", "App Registrations", "Conditional access"],
        relatedServices: ["key-vault"]
    },
    {
        id: "defender-for-cloud",
        provider: "azure",
        name: "Defender for Cloud",
        fullName: "Microsoft Defender for Cloud",
        category: "Security",
        description: "Unified security posture management and workload protection.",
        keywords: ["security", "posture", "defender", "compliance"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/defender-for-cloud/",
        commonUses: ["Security recommendations", "Regulatory compliance", "Threat protection"],
        relatedServices: ["key-vault", "microsoft-entra-id"]
    },

    // ---------- Management ----------
    {
        id: "azure-monitor",
        provider: "azure",
        name: "Azure Monitor",
        fullName: "Azure Monitor",
        category: "Management",
        description: "Collect, analyze, and act on telemetry from your cloud resources.",
        keywords: ["management", "monitoring", "observability", "metrics"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/azure-monitor/",
        commonUses: ["Metrics and alerts", "Diagnostic logs"],
        relatedServices: ["log-analytics", "application-insights"]
    },
    {
        id: "log-analytics",
        provider: "azure",
        name: "Log Analytics Workspace",
        fullName: "Azure Log Analytics Workspace",
        category: "Management",
        description: "Centralized store and query engine for log and metric data.",
        keywords: ["management", "logs", "monitoring", "kusto"],
        resourceType: "microsoft.operationalinsights/workspaces",
        consoleUrl: browseResourceUrl("microsoft.operationalinsights/workspaces"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-monitor/logs/log-analytics-overview",
        commonUses: ["Centralized logging", "KQL log queries", "AKS/VM diagnostics"],
        relatedServices: ["azure-monitor", "application-insights"]
    },
    {
        id: "application-insights",
        provider: "azure",
        name: "Application Insights",
        fullName: "Azure Application Insights",
        category: "Management",
        description: "Application performance monitoring for live web apps.",
        keywords: ["management", "apm", "monitoring", "telemetry"],
        resourceType: "microsoft.insights/components",
        consoleUrl: browseResourceUrl("microsoft.insights/components"),
        documentationUrl: "https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview",
        commonUses: ["Request/dependency tracing", "Exception tracking", "Live metrics"],
        relatedServices: ["app-service", "log-analytics"]
    },
    {
        id: "cost-management",
        provider: "azure",
        name: "Cost Management",
        fullName: "Microsoft Cost Management",
        category: "Management",
        description: "Analyze, monitor, and optimize cloud spend.",
        keywords: ["management", "cost", "billing", "budget"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/cost-management-billing/",
        commonUses: ["Spend analysis", "Budgets and alerts"],
        relatedServices: []
    },
    {
        id: "azure-policy",
        provider: "azure",
        name: "Azure Policy",
        fullName: "Azure Policy",
        category: "Management",
        description: "Enforce organizational standards and assess compliance at scale.",
        keywords: ["management", "governance", "compliance", "policy"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/governance/policy/",
        commonUses: ["Resource compliance enforcement", "Governance at scale"],
        relatedServices: ["defender-for-cloud"]
    },

    // ---------- Analytics ----------
    {
        id: "synapse-analytics",
        provider: "azure",
        name: "Synapse Analytics",
        fullName: "Azure Synapse Analytics",
        category: "Analytics",
        description: "Unified analytics platform combining big data and data warehousing.",
        keywords: ["analytics", "data warehouse", "big data"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/synapse-analytics/",
        commonUses: ["Data warehousing", "Big data analytics"],
        relatedServices: ["data-factory"]
    },
    {
        id: "data-factory",
        provider: "azure",
        name: "Data Factory",
        fullName: "Azure Data Factory",
        category: "Analytics",
        description: "Managed data integration and ETL/ELT pipeline service.",
        keywords: ["analytics", "etl", "data pipeline", "integration"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/data-factory/",
        commonUses: ["Data pipelines", "ETL/ELT orchestration"],
        relatedServices: ["synapse-analytics", "storage-accounts"]
    },
    {
        id: "databricks",
        provider: "azure",
        name: "Databricks",
        fullName: "Azure Databricks",
        category: "Analytics",
        description: "Apache Spark-based analytics platform for big data and AI.",
        keywords: ["analytics", "spark", "big data", "data science"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/databricks/",
        commonUses: ["Large-scale data processing", "Machine learning pipelines"],
        relatedServices: ["synapse-analytics", "azure-machine-learning"]
    },

    // ---------- Application Integration ----------
    {
        id: "service-bus",
        provider: "azure",
        name: "Service Bus",
        fullName: "Azure Service Bus",
        category: "Application Integration",
        description: "Reliable enterprise messaging with queues and topics.",
        keywords: ["integration", "messaging", "queue", "pub-sub"],
        resourceType: "microsoft.servicebus/namespaces",
        consoleUrl: browseResourceUrl("microsoft.servicebus/namespaces"),
        documentationUrl: "https://learn.microsoft.com/azure/service-bus-messaging/",
        commonUses: ["Decoupled microservices", "Reliable async messaging"],
        relatedServices: ["event-grid", "event-hubs"]
    },
    {
        id: "event-grid",
        provider: "azure",
        name: "Event Grid",
        fullName: "Azure Event Grid",
        category: "Application Integration",
        description: "Fully managed event routing service.",
        keywords: ["integration", "events", "event-driven", "pub-sub"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/event-grid/",
        commonUses: ["Event-driven architectures", "Reacting to resource changes"],
        relatedServices: ["service-bus", "azure-functions"]
    },
    {
        id: "event-hubs",
        provider: "azure",
        name: "Event Hubs",
        fullName: "Azure Event Hubs",
        category: "Application Integration",
        description: "Big data streaming platform and event ingestion service.",
        keywords: ["integration", "streaming", "events", "kafka"],
        resourceType: "microsoft.eventhub/namespaces",
        consoleUrl: browseResourceUrl("microsoft.eventhub/namespaces"),
        documentationUrl: "https://learn.microsoft.com/azure/event-hubs/",
        commonUses: ["Telemetry ingestion", "Log/event streaming at scale"],
        relatedServices: ["service-bus", "stream-analytics"]
    },
    {
        id: "logic-apps",
        provider: "azure",
        name: "Logic Apps",
        fullName: "Azure Logic Apps",
        category: "Application Integration",
        description: "Automate workflows across apps and services with low code.",
        keywords: ["integration", "workflow", "automation", "low-code"],
        resourceType: "microsoft.logic/workflows",
        consoleUrl: browseResourceUrl("microsoft.logic/workflows"),
        documentationUrl: "https://learn.microsoft.com/azure/logic-apps/",
        commonUses: ["Workflow automation", "Connecting SaaS apps"],
        relatedServices: ["azure-functions", "event-grid"]
    },
    {
        id: "api-management",
        provider: "azure",
        name: "API Management",
        fullName: "Azure API Management",
        category: "Application Integration",
        description: "Publish, secure, and analyze APIs at scale.",
        keywords: ["integration", "api", "gateway", "management"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/api-management/",
        commonUses: ["API gateways", "Rate limiting and API keys"],
        relatedServices: ["app-service", "azure-functions"]
    },
    {
        id: "stream-analytics",
        provider: "azure",
        name: "Stream Analytics",
        fullName: "Azure Stream Analytics",
        category: "Application Integration",
        description: "Real-time analytics on streaming data.",
        keywords: ["integration", "streaming", "real-time", "analytics"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/stream-analytics/",
        commonUses: ["Real-time dashboards", "IoT telemetry processing"],
        relatedServices: ["event-hubs", "iot-hub"]
    },

    // ---------- AI & ML ----------
    {
        id: "azure-machine-learning",
        provider: "azure",
        name: "Machine Learning",
        fullName: "Azure Machine Learning",
        category: "AI & ML",
        description: "Build, train, and deploy machine learning models at scale.",
        keywords: ["ai", "ml", "machine learning", "data science"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/machine-learning/",
        commonUses: ["Model training and deployment", "MLOps pipelines"],
        relatedServices: ["databricks", "cognitive-services"]
    },
    {
        id: "cognitive-services",
        provider: "azure",
        name: "Cognitive Services",
        fullName: "Azure AI Services",
        category: "AI & ML",
        description: "Pre-built AI models for vision, speech, language, and decision.",
        keywords: ["ai", "cognitive services", "vision", "speech", "language"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/ai-services/",
        commonUses: ["Text/image analysis", "Speech-to-text", "Translation"],
        relatedServices: ["azure-openai", "azure-machine-learning"]
    },
    {
        id: "azure-openai",
        provider: "azure",
        name: "Azure OpenAI Service",
        fullName: "Azure OpenAI Service",
        category: "AI & ML",
        description: "Access OpenAI's large language models with Azure's enterprise security.",
        keywords: ["ai", "openai", "llm", "gpt"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/ai-services/openai/",
        commonUses: ["Generative AI features", "Chatbots and copilots"],
        relatedServices: ["cognitive-services"]
    },
    {
        id: "bot-service",
        provider: "azure",
        name: "Bot Service",
        fullName: "Azure Bot Service",
        category: "AI & ML",
        description: "Build and deploy intelligent conversational bots.",
        keywords: ["ai", "bot", "chatbot", "conversational"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/bot-service/",
        commonUses: ["Customer service chatbots", "Virtual assistants"],
        relatedServices: ["cognitive-services", "azure-openai"]
    },

    // ---------- Migration ----------
    {
        id: "azure-migrate",
        provider: "azure",
        name: "Azure Migrate",
        fullName: "Azure Migrate",
        category: "Migration",
        description: "Discover, assess, and migrate on-premises workloads to Azure.",
        keywords: ["migration", "assessment", "lift and shift"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/migrate/",
        commonUses: ["Server migration assessment", "Database migration planning"],
        relatedServices: ["virtual-machines", "sql-database"]
    },
    {
        id: "site-recovery",
        provider: "azure",
        name: "Site Recovery",
        fullName: "Azure Site Recovery",
        category: "Migration",
        description: "Disaster recovery for on-premises and cloud workloads.",
        keywords: ["migration", "disaster recovery", "dr", "replication"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/site-recovery/",
        commonUses: ["Business continuity", "Cross-region failover"],
        relatedServices: ["azure-migrate", "virtual-machines"]
    },

    // ---------- IoT ----------
    {
        id: "iot-hub",
        provider: "azure",
        name: "IoT Hub",
        fullName: "Azure IoT Hub",
        category: "IoT",
        description: "Managed service for bi-directional communication with IoT devices.",
        keywords: ["iot", "devices", "telemetry"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/iot-hub/",
        commonUses: ["Device connectivity", "Telemetry ingestion"],
        relatedServices: ["stream-analytics", "iot-central"]
    },
    {
        id: "iot-central",
        provider: "azure",
        name: "IoT Central",
        fullName: "Azure IoT Central",
        category: "IoT",
        description: "Fully managed SaaS platform for IoT application building.",
        keywords: ["iot", "saas", "devices"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/iot-central/",
        commonUses: ["Turnkey IoT solutions", "Device fleet management"],
        relatedServices: ["iot-hub"]
    },
    {
        id: "digital-twins",
        provider: "azure",
        name: "Digital Twins",
        fullName: "Azure Digital Twins",
        category: "IoT",
        description: "Model and simulate real-world environments with IoT data.",
        keywords: ["iot", "digital twin", "modeling"],
        consoleUrl: PORTAL_HOME,
        documentationUrl: "https://learn.microsoft.com/azure/digital-twins/",
        commonUses: ["Smart building/factory modeling", "Spatial intelligence"],
        relatedServices: ["iot-hub"]
    }

];

export default AZURE_SERVICES;
