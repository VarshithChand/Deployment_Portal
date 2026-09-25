import { useEffect, useState } from "react";
import { Check, PlusCircle } from "lucide-react";

import useToast from "../../hooks/useToast";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import TerraformAddResourceForm from "./TerraformAddResourceForm";
import { getTerraformResourceInstances, renameTerraformResourceInstance } from "../../services/terraformService";

const KIND_LABELS = {
    azurerm_windows_web_app: "Web App",
    azurerm_linux_web_app: "Web App",
    azurerm_windows_function_app: "Function App",
    azurerm_linux_function_app: "Function App",
    azurerm_servicebus_queue: "Service Bus Queue"
};

function ResourceRow({ instance, onSaved }) {

    const toast = useToast();
    const [value, setValue] = useState(instance.displayName);
    const [saving, setSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    const dirty = value.trim() !== instance.displayName && value.trim().length > 0;

    async function handleSave() {

        setSaving(true);

        try {

            const result = await renameTerraformResourceInstance(
                instance.projectId, instance.variableName, instance.key, value.trim()
            );

            if (!result.success) {
                toast.show(result.message || "Unable to rename that.", "error");
                return;
            }

            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2200);

            onSaved();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to rename that right now.", "error");
        }
        finally {
            setSaving(false);
        }

    }

    return (

        <tr className={justSaved ? "terraform-row-just-saved" : ""}>
            <td>
                <input
                    type="text"
                    className="form-control"
                    style={{ maxWidth: 320 }}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
            </td>
            <td>
                <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving} onClick={handleSave}>
                    {saving ? "Saving..." : justSaved ? <><Check size={13} style={{ verticalAlign: -2 }} /> Saved</> : "Save"}
                </button>
            </td>
        </tr>

    );

}

function ResourceGroup({ projectId, resourceType, variableName, instances, onSaved }) {

    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(instances, 10);

    return (

        <div className="settings-subsection">

            <h4 className="settings-subhead" style={{ marginTop: 0 }}>
                {KIND_LABELS[resourceType] || resourceType} &mdash; {variableName} ({instances.length})
            </h4>

            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {pageItems.map((instance) => (
                            <ResourceRow
                                key={instance.key}
                                instance={{ ...instance, projectId }}
                                onSaved={onSaved}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination
                page={page}
                pageCount={pageCount}
                totalCount={totalCount}
                startIndex={startIndex}
                endIndex={endIndex}
                onPageChange={setPage}
            />

        </div>

    );

}

// The friendly, non-technical view over every individual resource instance
// this project creates (one row per web app / function app / queue, not
// per HCL block) - rename and save without hand-editing HCL, and add new
// ones via the same wizard the project page's own "Add Resource" button
// uses. See TerraformResourceExtractor.BuildResourceInstances for how each
// row is discovered.
export default function TerraformResourcesTab({ projectId }) {

    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addResourceOpen, setAddResourceOpen] = useState(false);

    function load() {
        setLoading(true);
        getTerraformResourceInstances(projectId)
            .then((result) => setInstances(result.instances || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(load, [projectId]);

    const groups = [];
    const seen = new Set();

    for (const instance of instances) {
        if (seen.has(instance.variableName)) continue;
        seen.add(instance.variableName);
        groups.push({
            resourceType: instance.resourceType,
            variableName: instance.variableName,
            instances: instances.filter((i) => i.variableName === instance.variableName)
        });
    }

    return (

        <div>

            <div className="access-panel-header">
                <h3 className="settings-subhead" style={{ margin: 0 }}>Resources</h3>
                <button type="button" className="btn btn-primary" onClick={() => setAddResourceOpen(true)}>
                    <PlusCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Add Resource
                </button>
            </div>

            <p className="field-hint" style={{ marginTop: 0 }}>
                Every web app, function app, and queue this project creates - rename one and save to
                edit terraform.tfvars directly, no HCL editing needed.
            </p>

            {loading ? (
                <p className="field-hint">Loading...</p>
            ) : groups.length === 0 ? (
                <p className="empty-state">
                    No resources found yet. Upload your files, or click "Add Resource" to create one.
                </p>
            ) : (
                groups.map((g) => (
                    <ResourceGroup
                        key={g.variableName}
                        projectId={projectId}
                        resourceType={g.resourceType}
                        variableName={g.variableName}
                        instances={g.instances}
                        onSaved={load}
                    />
                ))
            )}

            <TerraformAddResourceForm
                projectId={projectId}
                open={addResourceOpen}
                onClose={() => setAddResourceOpen(false)}
                onAdded={load}
            />

        </div>

    );

}
