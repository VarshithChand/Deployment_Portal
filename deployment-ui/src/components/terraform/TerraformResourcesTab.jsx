import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import useToast from "../../hooks/useToast";
import useConfirm from "../../hooks/useConfirm";
import usePagination from "../../hooks/usePagination";
import Pagination from "../common/Pagination";
import {
    getTerraformResourceInstances, renameTerraformResourceInstance, removeTerraformResourceInstance
} from "../../services/terraformService";

const KIND_LABELS = {
    azurerm_windows_web_app: "Web App",
    azurerm_linux_web_app: "Web App",
    azurerm_windows_function_app: "Function App",
    azurerm_linux_function_app: "Function App",
    azurerm_servicebus_queue: "Service Bus Queue",
    azurerm_application_insights: "Application Insights"
};

// A staged-but-not-yet-saved web app (see TerraformAddResourceForm's own
// comment) - no rename/save here, just its name and a way to drop it
// before it's ever written to terraform.tfvars.
function PendingResourceRow({ instance, onRemove }) {

    return (

        <tr className="terraform-row-just-saved">
            <td>
                {instance.displayName}
                {" "}
                <span className="badge badge-warning">Unsaved</span>
            </td>
            <td>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => onRemove(instance.tempId)}>
                    <X size={13} style={{ verticalAlign: -2 }} />
                    Remove
                </button>
            </td>
        </tr>

    );

}

function ResourceRow({ instance, onSaved, onRemove, removing, forceFlash }) {

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

        <tr className={(justSaved || forceFlash) ? "terraform-row-just-saved" : ""}>
            <td>
                <input
                    type="text"
                    className="form-control"
                    style={{ width: "100%", boxSizing: "border-box" }}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
            </td>
            <td style={{ whiteSpace: "nowrap" }}>
                <button type="button" className="btn btn-sm btn-primary" disabled={!dirty || saving || removing} onClick={handleSave}>
                    {saving ? "Saving..." : justSaved ? <><Check size={13} style={{ verticalAlign: -2 }} /> Saved</> : "Save"}
                </button>
                {" "}
                <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={saving || removing}
                    onClick={() => onRemove(instance)}
                >
                    {removing ? "Removing..." : "Remove"}
                </button>
            </td>
        </tr>

    );

}

function ResourceGroup({
    projectId, resourceType, variableName, instances, pendingInstances,
    onSaved, onRemovePending, onRemove, removingKey, flashedKeys
}) {

    // Pending drafts always show (unpaginated, there's realistically only a
    // handful in flight at once) ahead of the already-saved, paginated list -
    // an in-progress add shouldn't be buried on page 3.
    const { page, setPage, pageCount, pageItems, totalCount, startIndex, endIndex } = usePagination(instances, 10);

    return (

        <div className="settings-subsection">

            <h4 className="settings-subhead" style={{ marginTop: 0 }}>
                {KIND_LABELS[resourceType] || resourceType} &mdash; {variableName} ({instances.length})
            </h4>

            <div className="table-scroll">
                <table className="data-table" style={{ width: "100%", tableLayout: "fixed" }}>
                    <colgroup>
                        <col />
                        <col style={{ width: 190 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th><span className="visually-hidden">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingInstances.map((instance) => (
                            <PendingResourceRow key={instance.tempId} instance={instance} onRemove={onRemovePending} />
                        ))}
                        {pageItems.map((instance) => (
                            <ResourceRow
                                key={instance.key}
                                instance={{ ...instance, projectId }}
                                onSaved={onSaved}
                                onRemove={onRemove}
                                removing={removingKey === `${instance.variableName}::${instance.key}`}
                                forceFlash={flashedKeys?.has(`${instance.variableName}::${instance.key}`)}
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
// per HCL block) - rename and save without hand-editing HCL. "Add Resource"
// itself lives on the project page (TerraformProjectPage), shared with the
// Files tab's own button and the one place pending (unsaved) web app
// drafts are held - see that component's own comment. See
// TerraformResourceExtractor.BuildResourceInstances for how each row is
// discovered.
export default function TerraformResourcesTab({ projectId, pendingInstances, onRemovePending, flashedKeys, refreshToken }) {

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    const [instances, setInstances] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removingKey, setRemovingKey] = useState(null);

    function load() {
        setLoading(true);
        getTerraformResourceInstances(projectId)
            .then((result) => setInstances(result.instances || []))
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(load, [projectId, refreshToken]);

    // Removes an EXISTING (already-saved) instance - distinct from
    // onRemovePending, which just drops a not-yet-written draft. This is a
    // real tfvars edit (see TerraformTfvarsEditor.RemoveEntry's own
    // comment), so it's confirmed first.
    async function handleRemoveInstance(instance) {

        if (!(await confirm({
            title: "Remove this resource?",
            message: `"${instance.displayName}" will be removed from terraform.tfvars. This doesn't touch Azure until you run Plan/Apply.`,
            confirmLabel: "Remove",
            danger: true
        }))) {
            return;
        }

        setRemovingKey(`${instance.variableName}::${instance.key}`);

        try {

            const result = await removeTerraformResourceInstance(projectId, instance.variableName, instance.key);

            if (!result.success) {
                toast.show(result.message || "Unable to remove that.", "error");
                return;
            }

            toast.show(`"${instance.displayName}" removed.`, "success");
            load();

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to remove that right now.", "error");
        }
        finally {
            setRemovingKey(null);
        }

    }

    // Every group that has either a real (saved) instance OR a pending
    // draft - a brand new target with zero existing entries yet would
    // otherwise have no group to stage its first draft into.
    const variableNames = [];
    const seen = new Set();

    for (const instance of [...instances, ...(pendingInstances || [])]) {
        if (seen.has(instance.variableName)) continue;
        seen.add(instance.variableName);
        variableNames.push({ variableName: instance.variableName, resourceType: instance.resourceType });
    }

    return (

        <div>

            {dialog}

            <p className="field-hint" style={{ marginTop: 0 }}>
                Every web app, function app, and queue this project creates - rename or remove one and
                save to edit terraform.tfvars directly, no HCL editing needed.
            </p>

            {loading ? (
                <p className="field-hint">Loading...</p>
            ) : variableNames.length === 0 ? (
                <p className="empty-state">
                    No resources found yet. Upload your files, or click "Add Resource" to create one.
                </p>
            ) : (
                variableNames.map((g) => (
                    <ResourceGroup
                        key={g.variableName}
                        projectId={projectId}
                        resourceType={g.resourceType}
                        variableName={g.variableName}
                        instances={instances.filter((i) => i.variableName === g.variableName)}
                        pendingInstances={(pendingInstances || []).filter((i) => i.variableName === g.variableName)}
                        onSaved={load}
                        onRemovePending={onRemovePending}
                        onRemove={handleRemoveInstance}
                        removingKey={removingKey}
                        flashedKeys={flashedKeys}
                    />
                ))
            )}

        </div>

    );

}
