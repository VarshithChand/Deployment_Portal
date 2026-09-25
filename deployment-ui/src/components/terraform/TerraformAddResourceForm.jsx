import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";

import useToast from "../../hooks/useToast";
import {
    getTerraformAddTargets, addTerraformResourceInstance, generateTerraformTemplate
} from "../../services/terraformService";

// Friendlier labels for the raw azurerm_* resource type strings -
// deliberately a small fixed map (not a generic formatter) since these are
// exactly the three kinds this wizard (and TerraformNewResourceTemplates.cs
// on the backend) knows how to create.
const KIND_LABELS = {
    azurerm_windows_web_app: "Web App",
    azurerm_linux_web_app: "Web App",
    azurerm_windows_function_app: "Function App",
    azurerm_linux_function_app: "Function App",
    azurerm_servicebus_queue: "Service Bus Queue"
};

const NEW_KINDS = [
    { value: "webApp", label: "Web App" },
    { value: "functionApp", label: "Function App" },
    { value: "serviceBusQueue", label: "Service Bus Queue" }
];

const NEW_TARGET_VALUE = "__new__";

const WEB_APP_TYPES = new Set(["azurerm_windows_web_app", "azurerm_linux_web_app"]);

const DEPLOYMENT_MODES = [
    { value: "A", label: "A only" },
    { value: "B", label: "B only" },
    { value: "A+B", label: "A + B (both)" }
];

// "Add a web app / function app / service bus queue" without hand-editing
// HCL - picks an existing for_each-driven target already in the project
// (see TerraformResourceExtractor.BuildAddTargets) and inserts one new
// entry into the right .tfvars variable, or - if nothing existing fits -
// generates a starter template (TerraformNewResourceTemplates.cs) to
// review and connect.
//
// Adding to an EXISTING web app target is staged, not written immediately:
// this project's own web apps come in "-A"/"-B" paired-deployment names
// (see TerraformProjectPage's groupInstanceNames), and each one carries its
// own appsettings_file/connectionstrings_file config - enough to fill in
// wrong that the caller (TerraformProjectPage) holds these as pending
// drafts, shown in green, until an explicit "Save Changes" actually writes
// them. Every other kind (function app, service bus, or "no existing
// target fits") has no such per-entry config to get wrong, and keeps
// today's immediate write via onAdded.
export default function TerraformAddResourceForm({ projectId, open, onClose, onAdded, onStage }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [targets, setTargets] = useState([]);
    const [selectedTarget, setSelectedTarget] = useState("");
    const [newKind, setNewKind] = useState(NEW_KINDS[0].value);
    const [name, setName] = useState("");
    const [appsettingsFile, setAppsettingsFile] = useState("config/appsettings.json");
    const [connectionstringsFile, setConnectionstringsFile] = useState("config/connectionstrings.json");
    const [deploymentMode, setDeploymentMode] = useState("A+B");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {

        if (!open) return;

        setLoading(true);
        setSelectedTarget("");
        setName("");
        setAppsettingsFile("config/appsettings.json");
        setConnectionstringsFile("config/connectionstrings.json");
        setDeploymentMode("A+B");

        getTerraformAddTargets(projectId)
            .then((result) => {
                const found = result.targets || [];
                setTargets(found);
                setSelectedTarget(found.length > 0 ? found[0].variableName : NEW_TARGET_VALUE);
            })
            .catch((err) => {
                console.error(err);
                toast.show("Unable to load what this project already creates.", "error");
                setTargets([]);
                setSelectedTarget(NEW_TARGET_VALUE);
            })
            .finally(() => setLoading(false));

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectId]);

    if (!open) return null;

    const selectedIsExisting = selectedTarget !== NEW_TARGET_VALUE;
    const selectedTargetObj = targets.find((t) => t.variableName === selectedTarget);
    const isWebAppTarget = selectedIsExisting && WEB_APP_TYPES.has(selectedTargetObj?.resourceType);

    async function handleSubmit(e) {

        e.preventDefault();

        if (!name.trim()) {
            toast.show("Enter a name first.", "error");
            return;
        }

        setSubmitting(true);

        try {

            if (isWebAppTarget) {

                const baseName = name.trim();
                const suffixes = deploymentMode === "A+B" ? ["A", "B"] : [deploymentMode];

                const items = suffixes.map((suffix) => ({
                    tempId: crypto.randomUUID(),
                    resourceType: selectedTargetObj.resourceType,
                    variableName: selectedTargetObj.variableName,
                    fileName: selectedTargetObj.fileName,
                    name: `${baseName}-${suffix}`,
                    displayName: `${baseName}-${suffix}`,
                    appsettingsFile: appsettingsFile.trim(),
                    connectionstringsFile: connectionstringsFile.trim()
                }));

                onStage(items);
                toast.show(
                    `"${baseName}" staged (${suffixes.join(", ")}) - click Save Changes to write it to terraform.tfvars.`,
                    "success"
                );
                onClose();
                return;

            }

            let touchedFiles = [];

            if (selectedTarget === NEW_TARGET_VALUE) {

                const result = await generateTerraformTemplate(projectId, newKind, name.trim());

                if (!result.success) {
                    toast.show(result.message || "Unable to generate a template.", "error");
                    return;
                }

                touchedFiles = result.updatedFiles || [];

                toast.show(
                    `Starter template added to ${result.updatedFiles.join(", ")} - review and connect before running Plan.`,
                    "success"
                );

            }
            else {

                const result = await addTerraformResourceInstance(projectId, selectedTarget, name.trim());

                if (!result.success) {
                    toast.show(result.message || "Unable to add that.", "error");
                    return;
                }

                const target = targets.find((t) => t.variableName === selectedTarget);
                touchedFiles = target ? [target.fileName] : [];

                toast.show(`"${name.trim()}" added.`, "success");

            }

            onAdded(touchedFiles);
            onClose();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to add that right now.", "error");
        }
        finally {
            setSubmitting(false);
        }

    }

    return (

        <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="terraform-add-resource-title">

                <h2 id="terraform-add-resource-title">
                    <PlusCircle size={18} style={{ marginRight: 6, verticalAlign: -3 }} />
                    Add a Resource
                </h2>

                {loading ? (

                    <p className="field-hint">Loading...</p>

                ) : (

                    <form onSubmit={handleSubmit}>

                        <div className="form-group">
                            <label htmlFor="tf-add-target">Add to</label>
                            <select
                                id="tf-add-target"
                                className="form-control"
                                value={selectedTarget}
                                onChange={(e) => setSelectedTarget(e.target.value)}
                            >
                                {targets.map((t) => (
                                    <option key={t.variableName} value={t.variableName}>
                                        {(KIND_LABELS[t.resourceType] || t.resourceType)} — {t.variableName} ({t.existingCount} existing)
                                    </option>
                                ))}
                                <option value={NEW_TARGET_VALUE}>+ Create new (no existing group fits)</option>
                            </select>
                            {targets.length === 0 && (
                                <p className="field-hint" style={{ marginTop: "6px" }}>
                                    This project doesn't have an existing for_each-driven group yet - pick a kind below
                                    to create one.
                                </p>
                            )}
                        </div>

                        {!selectedIsExisting && (
                            <div className="form-group">
                                <label htmlFor="tf-add-kind">Kind</label>
                                <select
                                    id="tf-add-kind"
                                    className="form-control"
                                    value={newKind}
                                    onChange={(e) => setNewKind(e.target.value)}
                                >
                                    {NEW_KINDS.map((k) => (
                                        <option key={k.value} value={k.value}>{k.label}</option>
                                    ))}
                                </select>
                                <p className="field-hint" style={{ marginTop: "6px" }}>
                                    Generates a starter module block appended to main.tf, and writes the
                                    module's own files under modules/&lt;kind&gt;/ if they don't already exist
                                    (an existing real module is never overwritten). Function App also bundles
                                    its own Application Insights resource. Review and connect (existing
                                    Resource Group reference, Plan SKU) before running Plan - not a finished
                                    wire-up.
                                </p>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="tf-add-name">Name{isWebAppTarget ? " (without -A/-B)" : ""}</label>
                            <input
                                id="tf-add-name"
                                type="text"
                                className="form-control"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. vcpms-new-app-cluster04"
                                autoFocus
                            />
                        </div>

                        {isWebAppTarget && (

                            <>

                                <div className="form-group">
                                    <label htmlFor="tf-add-deployment-mode">Deployment</label>
                                    <select
                                        id="tf-add-deployment-mode"
                                        className="form-control"
                                        value={deploymentMode}
                                        onChange={(e) => setDeploymentMode(e.target.value)}
                                    >
                                        {DEPLOYMENT_MODES.map((m) => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <p className="field-hint" style={{ marginTop: "6px" }}>
                                        This project's web apps come in paired "-A"/"-B" deployments - pick which
                                        one(s) to create.
                                    </p>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="tf-add-appsettings">Appsettings file</label>
                                    <input
                                        id="tf-add-appsettings"
                                        type="text"
                                        className="form-control"
                                        value={appsettingsFile}
                                        onChange={(e) => setAppsettingsFile(e.target.value)}
                                        placeholder="config/appsettings.json"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="tf-add-connectionstrings">Connection strings file</label>
                                    <input
                                        id="tf-add-connectionstrings"
                                        type="text"
                                        className="form-control"
                                        value={connectionstringsFile}
                                        onChange={(e) => setConnectionstringsFile(e.target.value)}
                                        placeholder="config/connectionstrings.json"
                                    />
                                </div>

                                <p className="field-hint" style={{ marginTop: "-4px" }}>
                                    Not written to terraform.tfvars yet - click "Stage" below, then "Save Changes"
                                    on the project page when you're ready.
                                </p>

                            </>

                        )}

                        <div className="button-row">
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? "Adding..." : isWebAppTarget ? "Stage" : "Add"}
                            </button>
                            <button type="button" className="btn btn-secondary" disabled={submitting} onClick={onClose}>
                                Cancel
                            </button>
                        </div>

                    </form>

                )}

            </div>

        </div>

    );

}
