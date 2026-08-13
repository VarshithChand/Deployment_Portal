// Standard AWS regions, {value,label}-shaped for ComboBox (see
// components/common/ComboBox.jsx) - used both by the AWS credential save
// form (AwsLoginSection) and the read-only per-view region switchers on
// Cloud Services / the Dashboard's AWS Services card. Not exhaustive (AWS
// adds regions over time, and GovCloud/China partitions are omitted since
// this portal has no use for them) - a region typed that isn't in this
// list still works everywhere it's actually used, it just won't
// autocomplete.
const AWS_REGIONS = [
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-east-2", label: "US East (Ohio)" },
    { value: "us-west-1", label: "US West (N. California)" },
    { value: "us-west-2", label: "US West (Oregon)" },
    { value: "af-south-1", label: "Africa (Cape Town)" },
    { value: "ap-east-1", label: "Asia Pacific (Hong Kong)" },
    { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
    { value: "ap-south-2", label: "Asia Pacific (Hyderabad)" },
    { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
    { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
    { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
    { value: "ap-southeast-3", label: "Asia Pacific (Jakarta)" },
    { value: "ap-southeast-4", label: "Asia Pacific (Melbourne)" },
    { value: "ca-central-1", label: "Canada (Central)" },
    { value: "ca-west-1", label: "Canada West (Calgary)" },
    { value: "eu-central-1", label: "Europe (Frankfurt)" },
    { value: "eu-central-2", label: "Europe (Zurich)" },
    { value: "eu-west-1", label: "Europe (Ireland)" },
    { value: "eu-west-2", label: "Europe (London)" },
    { value: "eu-west-3", label: "Europe (Paris)" },
    { value: "eu-north-1", label: "Europe (Stockholm)" },
    { value: "eu-south-1", label: "Europe (Milan)" },
    { value: "eu-south-2", label: "Europe (Spain)" },
    { value: "me-central-1", label: "Middle East (UAE)" },
    { value: "me-south-1", label: "Middle East (Bahrain)" },
    { value: "il-central-1", label: "Israel (Tel Aviv)" },
    { value: "sa-east-1", label: "South America (Sao Paulo)" }
];

export default AWS_REGIONS;
