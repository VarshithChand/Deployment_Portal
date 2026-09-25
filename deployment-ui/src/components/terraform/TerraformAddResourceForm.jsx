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

// "Add a web app / function app / service bus queue" without hand-editing
// HCL - picks an existing for_each-driven target already in the project
// (see TerraformResourceExtractor.BuildAddTargets) and inserts one new
// entry into the right .tfvars variable, or - if nothing existing fits -
// generates a starter template (TerraformNewResourceTemplates.cs) to
// review and connect.
export default function TerraformAddResourceForm({ projectId, open, onClose, onAdded }) {

    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [targets, setTargets] = useState([]);
    const [selectedTarget, setSelectedTarget] = useState("");
    const [newKind, setNewKind] = useState(NEW_KINDS[0].value);
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {

        if (!open) return;

        setLoading(true);
        setSelectedTarget("");
        setName("");

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

    async function handleSubmit(e) {

        e.preventDefault();

        if (!name.trim()) {
            toast.show("Enter a name first.", "error");
            return;
        }

        setSubmitting(true);

        try {

            if (selectedTarget === NEW_TARGET_VALUE) {

                const result = await generateTerraformTemplate(projectId, newKind, name.trim());

                if (!result.success) {
                    toast.show(result.message || "Unable to generate a template.", "error");
                    return;
                }

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

                toast.show(`"${name.trim()}" added.`, "success");

            }

            onAdded();
            onClose();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to add that right now.", "error");
        }
        finally {
            setSubmitting(false);
        }

    }

    const selectedIsExisting = selectedTarget !== NEW_TARGET_VALUE;

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
                                    Generates a starter Resource Group/Plan/module block appended to main.tf - a
                                    starting point to review and connect, not a finished wire-up.
                                </p>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="tf-add-name">Name</label>
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

                        <div className="button-row">
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {submitting ? "Adding..." : "Add"}
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
