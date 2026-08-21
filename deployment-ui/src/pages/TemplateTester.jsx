import { useRef, useState } from "react";

import PageLayout from "../components/layout/PageLayout";
import WorkflowGraph from "../components/templateTester/WorkflowGraph";
import { parseWorkflowYaml, tryFixIndentation, shouldSkipJob } from "../utils/parseWorkflowYaml";

const EXAMPLE_YAML = `name: Example CI/CD

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        type: choice
        options: [staging, production]
        default: staging
      skip_tests:
        description: 'Skip the test job'
        type: boolean
        default: false

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Lint
        run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Install dependencies
        run: npm install
      - name: Run tests
        run: npm test

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Build
        run: npm run build
      - name: Upload artifact
        uses: actions/upload-artifact@v4

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        run: ./deploy.sh
`;

const STEP_MS = 350;
const JOB_SETTLE_MS = 200;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultParamValues(parsed) {

    const values = { branch: parsed.defaultBranch || "main" };

    parsed.runParameters.forEach((param) => {
        values[param.name] = param.type === "boolean" ? !!param.default : (param.default ?? "");
    });

    return values;

}

export default function TemplateTester() {

    const [yamlText, setYamlText] = useState("");
    const [graph, setGraph] = useState(null);
    const [error, setError] = useState("");
    const [suggestedFix, setSuggestedFix] = useState(null);
    const [jobStates, setJobStates] = useState({});
    const [running, setRunning] = useState(false);
    const [runBranch, setRunBranch] = useState(null);

    // Set while a parsed pipeline has run parameters that need to be
    // picked before starting — mirrors Azure DevOps' own "Run pipeline"
    // dialog. { parsed, values } while open, null otherwise.
    const [paramDialog, setParamDialog] = useState(null);

    // Guards against a stale simulation still updating state after the
    // user re-clicks Run (or edits the YAML) mid-animation.
    const runToken = useRef(0);

    // jobId -> resolve function, for jobs currently paused at a GitHub
    // "environment:" approval gate mid-run.
    const pendingApprovals = useRef({});

    function handleTextChange(value) {
        setYamlText(value);
        setError("");
        setSuggestedFix(null);
        setGraph(null);
        setParamDialog(null);
        setRunBranch(null);
    }

    function loadExample() {
        handleTextChange(EXAMPLE_YAML);
    }

    // Validates the given text and returns the parsed graph on success.
    // On failure it sets the error message and, when the problem looks
    // like an indentation/whitespace issue rather than a real structural
    // mistake, a corrected version the user can review and apply — this
    // is the "ask for adjustment" step before anything is allowed to run.
    function validate(text) {

        try {
            const parsed = parseWorkflowYaml(text);
            setGraph(parsed);
            setError("");
            setSuggestedFix(null);
            return parsed;
        }
        catch (err) {

            setError(err.message);
            setGraph(null);

            const fixed = tryFixIndentation(text);

            if (fixed) {
                try {
                    parseWorkflowYaml(fixed);
                    setSuggestedFix(fixed);
                }
                catch {
                    setSuggestedFix(null);
                }
            }
            else {
                setSuggestedFix(null);
            }

            return null;

        }

    }

    // A real trigger always asks at least which branch to run — GitHub's
    // "Run workflow" button and Azure's "Run pipeline" button both open a
    // panel before anything starts, even for a pipeline with no other
    // declared inputs — so this always pauses here rather than only when
    // there happen to be extra parameters. Jobs whose condition doesn't
    // reference a checked parameter are skipped rather than run.
    function proceedAfterValidate(parsed) {

        if (!parsed) return;

        setParamDialog({ parsed, values: defaultParamValues(parsed) });

    }

    function handleRun() {
        proceedAfterValidate(validate(yamlText));
    }

    function handleApplyFix() {
        setYamlText(suggestedFix);
        proceedAfterValidate(validate(suggestedFix));
    }

    function updateParamValue(name, value) {
        setParamDialog((prev) => prev && ({ ...prev, values: { ...prev.values, [name]: value } }));
    }

    function startWithParams() {
        const { parsed, values } = paramDialog;
        setParamDialog(null);
        setRunBranch(values.branch);
        runSimulation(parsed, values);
    }

    function waitForApproval(jobId) {
        return new Promise((resolve) => {
            pendingApprovals.current[jobId] = resolve;
        });
    }

    function handleApprovalDecision(jobId, approved) {
        const resolve = pendingApprovals.current[jobId];
        if (!resolve) return;
        delete pendingApprovals.current[jobId];
        resolve(approved);
    }

    async function runJob(job, paramValues, statuses, token) {

        // A job downstream of a skipped/rejected dependency doesn't run
        // either — same as a real pipeline wouldn't attempt a deploy job
        // whose build job never happened. Only applies when this job has
        // no explicit condition of its own: Azure's implicit default
        // dependency gate is succeeded()-on-every-dependency, but setting
        // an explicit "condition:" REPLACES that default entirely rather
        // than combining with it — e.g. two stages each gated on which of
        // several mutually-exclusive values a parameter has (Start vs.
        // Stop) still both need to be independently reachable even though
        // the pipeline's default stage order makes the second implicitly
        // "depend on" the first.
        if (job.conditions.length === 0 && job.needs.some((dep) => statuses[dep] === "skipped")) {
            statuses[job.id] = "skipped";
            setJobStates((prev) => ({ ...prev, [job.id]: { status: "skipped", stepIndex: -1 } }));
            return;
        }

        // Azure condition gate: this job's own "condition:" and/or its
        // stage's, evaluated against the actual values chosen in the Run
        // dialog (see shouldSkipJob/parseWorkflowYaml.js).
        if (shouldSkipJob(job, paramValues)) {
            statuses[job.id] = "skipped";
            setJobStates((prev) => ({ ...prev, [job.id]: { status: "skipped", stepIndex: -1 } }));
            return;
        }

        // Azure run-parameter gate: skip unless at least one referenced
        // parameter was checked in the Run dialog.
        if (job.referencedParams.length > 0) {

            const included = job.referencedParams.some((name) => paramValues[name] === true);

            if (!included) {
                statuses[job.id] = "skipped";
                setJobStates((prev) => ({ ...prev, [job.id]: { status: "skipped", stepIndex: -1 } }));
                return;
            }

        }

        // GitHub environment gate: pause mid-run for a fake Approve/Reject,
        // same point in the flow a real required-reviewer gate would pause.
        if (job.environment) {

            setJobStates((prev) => ({ ...prev, [job.id]: { status: "waiting_approval", stepIndex: -1 } }));

            const approved = await waitForApproval(job.id);
            if (runToken.current !== token) return;

            if (!approved) {
                statuses[job.id] = "skipped";
                setJobStates((prev) => ({ ...prev, [job.id]: { status: "skipped", stepIndex: -1 } }));
                return;
            }

        }

        setJobStates((prev) => ({ ...prev, [job.id]: { status: "running", stepIndex: -1 } }));

        const stepCount = Math.max(job.steps.length, 1);

        for (let i = 0; i < stepCount; i++) {

            await sleep(STEP_MS);
            if (runToken.current !== token) return;

            setJobStates((prev) => ({ ...prev, [job.id]: { status: "running", stepIndex: i } }));

        }

        await sleep(JOB_SETTLE_MS);
        if (runToken.current !== token) return;

        statuses[job.id] = "success";
        setJobStates((prev) => ({ ...prev, [job.id]: { status: "success", stepIndex: stepCount - 1 } }));

    }

    async function runSimulation(parsed, paramValues) {

        const token = ++runToken.current;
        const statuses = {};
        const initialStates = {};

        parsed.jobs.forEach((job) => {
            initialStates[job.id] = { status: "pending", stepIndex: -1 };
            statuses[job.id] = "pending";
        });

        setJobStates(initialStates);
        setRunning(true);

        for (const layer of parsed.layers) {

            if (runToken.current !== token) return;

            await Promise.all(layer.map((id) => {
                const job = parsed.jobs.find((j) => j.id === id);
                return runJob(job, paramValues, statuses, token);
            }));

        }

        if (runToken.current === token) setRunning(false);

    }

    return (

        <PageLayout title="Template Tester">

            <div className="card">

                <h2 className="card-title">Workflow YAML</h2>

                <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                    Paste a GitHub Actions workflow or an Azure DevOps pipeline — this validates it
                    locally, then plays back the job graph based on each job's dependencies ("needs:"
                    or "dependsOn:"), entirely in your browser. Nothing here is sent to GitHub/Azure
                    or committed anywhere. A GitHub job with an "environment:" pauses for a fake
                    approval mid-run; an Azure pipeline with run parameters asks for them first,
                    just like each platform's own manual-run prompt.
                </p>

                <textarea
                    className="form-control"
                    style={{ fontFamily: "monospace", fontSize: "13px", minHeight: "260px", resize: "vertical" }}
                    value={yamlText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Paste your workflow.yml or azure-pipelines.yml content here..."
                    spellCheck={false}
                />

                <div className="button-row" style={{ marginTop: "15px" }}>

                    <button type="button" className="btn btn-primary" onClick={handleRun} disabled={running}>
                        {running ? "Running..." : "Run"}
                    </button>

                    <button type="button" className="btn btn-secondary" onClick={loadExample} disabled={running}>
                        Load example
                    </button>

                </div>

                {error && (
                    <div className="error-message" style={{ marginTop: "15px" }}>
                        {error}
                    </div>
                )}

                {suggestedFix && (

                    <div className="card" style={{ background: "var(--table-row-hover)", marginTop: "15px" }}>

                        <h3 style={{ marginTop: 0 }}>Suggested fix</h3>

                        <p className="empty-state" style={{ padding: "0 0 10px", textAlign: "left" }}>
                            This looks like a whitespace problem — tabs or trailing spaces where YAML
                            expects plain indentation. Here's a corrected version:
                        </p>

                        <pre className="workflow-fix-preview">{suggestedFix}</pre>

                        <div className="button-row" style={{ marginTop: "10px" }}>
                            <button type="button" className="btn btn-primary" onClick={handleApplyFix}>
                                Apply fix &amp; run
                            </button>
                        </div>

                    </div>

                )}

            </div>

            {paramDialog && (

                <div className="card">

                    <h2 className="card-title">Run this pipeline</h2>

                    <p className="empty-state" style={{ padding: "0 0 15px", textAlign: "left" }}>
                        Same prompt a real "Run workflow" / "Run pipeline" button would show — pick a
                        branch and fill in any inputs before starting. Jobs whose condition doesn't
                        reference a checked parameter show as skipped instead of running.
                    </p>

                    <div className="form-group">
                        <label htmlFor="template-tester-branch">Branch</label>
                        <input
                            id="template-tester-branch"
                            className="form-control"
                            value={paramDialog.values.branch}
                            onChange={(e) => updateParamValue("branch", e.target.value)}
                            placeholder="e.g. main"
                        />
                    </div>

                    {paramDialog.parsed.runParameters.map((param) => (

                        param.type === "boolean" ? (

                            <label key={param.name} className="checkbox-list-item">

                                <input
                                    type="checkbox"
                                    checked={!!paramDialog.values[param.name]}
                                    onChange={(e) => updateParamValue(param.name, e.target.checked)}
                                />
                                {" "}
                                {param.displayName}

                            </label>

                        ) : param.type === "choice" && param.options ? (

                            <div key={param.name} className="form-group">
                                <label>{param.displayName}</label>
                                <select
                                    className="form-control"
                                    value={paramDialog.values[param.name]}
                                    onChange={(e) => updateParamValue(param.name, e.target.value)}
                                >
                                    {param.options.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                        ) : (

                            <div key={param.name} className="form-group">
                                <label>{param.displayName}</label>
                                <input
                                    className="form-control"
                                    value={paramDialog.values[param.name]}
                                    onChange={(e) => updateParamValue(param.name, e.target.value)}
                                    placeholder={param.default ? String(param.default) : ""}
                                />
                            </div>

                        )

                    ))}

                    <div className="button-row" style={{ marginTop: "15px" }}>

                        <button type="button" className="btn btn-primary" onClick={startWithParams}>
                            Run
                        </button>

                        <button type="button" className="btn btn-secondary" onClick={() => setParamDialog(null)}>
                            Cancel
                        </button>

                    </div>

                </div>

            )}

            {graph && !paramDialog && (

                <div className="card">

                    <h2 className="card-title">
                        {graph.name || "Pipeline"}
                        {runBranch && (
                            <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--text-muted)", marginLeft: "10px" }}>
                                on {runBranch}
                            </span>
                        )}
                    </h2>

                    <WorkflowGraph
                        jobs={graph.jobs}
                        layers={graph.layers}
                        jobStates={jobStates}
                        onApprove={(jobId) => handleApprovalDecision(jobId, true)}
                        onReject={(jobId) => handleApprovalDecision(jobId, false)}
                    />

                </div>

            )}

        </PageLayout>

    );

}
