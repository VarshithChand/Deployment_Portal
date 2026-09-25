import { useState } from "react";
import { Sparkles, PlayCircle, Rocket } from "lucide-react";

import useToast from "../../hooks/useToast";
import CopilotMarkdown from "../copilot/CopilotMarkdown";
import TypedConfirmDialog from "../cloudServices/TypedConfirmDialog";
import { explainTerraformFiles, planTerraform, applyTerraform } from "../../services/terraformService";

// Real execution, unlike TerraformFilesSection's plain storage/editing -
// see TerraformExecutionService.cs's own header comment for the full
// reasoning (why plan/apply are safe here specifically because your files
// already declare a remote state backend). Explain never touches Azure;
// Plan and Apply both do, using your saved Service Principal.
export default function TerraformExecutionPanel() {

    const toast = useToast();

    const [explaining, setExplaining] = useState(false);
    const [explanation, setExplanation] = useState(null);

    const [planning, setPlanning] = useState(false);
    const [plan, setPlan] = useState(null); // { planId, output, summaryLine }
    const [planError, setPlanError] = useState(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const [applyOutput, setApplyOutput] = useState(null);
    const [applyError, setApplyError] = useState(null);

    async function handleExplain() {

        setExplaining(true);
        setExplanation(null);

        try {

            const result = await explainTerraformFiles();

            if (!result.success) {
                toast.show(result.message || "Unable to explain these files right now.", "error");
                return;
            }

            setExplanation(result.explanation);

        }
        catch (err) {
            toast.show(err.response?.data?.message || "Unable to explain these files right now.", "error");
        }
        finally {
            setExplaining(false);
        }

    }

    async function handlePlan() {

        setPlanning(true);
        setPlan(null);
        setPlanError(null);
        setApplyOutput(null);
        setApplyError(null);

        try {

            const result = await planTerraform();

            if (!result.success) {
                setPlanError(result.message || "terraform plan failed.");
                return;
            }

            setPlan(result);

        }
        catch (err) {
            setPlanError(err.response?.data?.message || "Unable to run terraform plan right now.");
        }
        finally {
            setPlanning(false);
        }

    }

    async function handleApplyConfirmed() {

        setApplying(true);

        try {

            const result = await applyTerraform(plan.planId, plan.summaryLine);

            if (!result.success) {
                setApplyError(result.message || "terraform apply failed.");
                setConfirmOpen(false);
                return;
            }

            setApplyOutput(result.output);
            setConfirmOpen(false);
            setPlan(null);
            toast.show("Apply completed.", "success");

        }
        catch (err) {
            setApplyError(err.response?.data?.message || "Unable to run terraform apply right now.");
            setConfirmOpen(false);
        }
        finally {
            setApplying(false);
        }

    }

    return (

        <div className="settings-subsection">

            <h3 className="settings-subhead">Explain, Plan &amp; Apply</h3>

            <p className="field-hint" style={{ marginTop: 0 }}>
                <strong>Explain</strong> reads your stored files and describes them in plain English - no
                Azure calls. <strong>Plan</strong> and <strong>Apply</strong> run the real terraform CLI
                against your Azure subscription using the Service Principal above; Apply actually creates,
                changes, or destroys real resources and requires typing the plan's own summary line to confirm.
            </p>

            <div className="button-row">

                <button type="button" className="btn btn-secondary" disabled={explaining} onClick={handleExplain}>
                    <Sparkles size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {explaining ? "Explaining..." : "Explain"}
                </button>

                <button type="button" className="btn btn-secondary" disabled={planning} onClick={handlePlan}>
                    <PlayCircle size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    {planning ? "Planning... (this can take a minute)" : "Run Plan"}
                </button>

                <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!plan}
                    onClick={() => setConfirmOpen(true)}
                >
                    <Rocket size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                    Apply
                </button>

            </div>

            {explanation && (
                <div className="card" style={{ marginTop: 14 }}>
                    <CopilotMarkdown text={explanation} />
                </div>
            )}

            {planError && (
                <>
                    <p className="field-hint field-hint-bad" style={{ marginTop: 14 }}>Plan failed.</p>
                    <pre className="terraform-output">{planError}</pre>
                </>
            )}

            {plan && (
                <div style={{ marginTop: 14 }}>
                    <p className="field-hint field-hint-good" style={{ margin: "0 0 8px" }}>
                        {plan.summaryLine}
                    </p>
                    <pre className="terraform-output">{plan.output}</pre>
                </div>
            )}

            {applyError && (
                <>
                    <p className="field-hint field-hint-bad" style={{ marginTop: 14 }}>Apply failed.</p>
                    <pre className="terraform-output">{applyError}</pre>
                </>
            )}

            {applyOutput && (
                <div style={{ marginTop: 14 }}>
                    <p className="field-hint field-hint-good" style={{ margin: "0 0 8px" }}>Apply completed.</p>
                    <pre className="terraform-output">{applyOutput}</pre>
                </div>
            )}

            <TypedConfirmDialog
                open={confirmOpen}
                title="Apply this Terraform plan?"
                message="This will run terraform apply against your real Azure subscription using the changes shown above. This cannot be undone from here."
                resourceName={plan?.summaryLine || ""}
                confirmLabel="Apply"
                loading={applying}
                onConfirm={handleApplyConfirmed}
                onCancel={() => setConfirmOpen(false)}
            />

        </div>

    );

}
