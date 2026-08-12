// A resource state (EC2 instance state, ECS service health, etc.) as a
// colored badge - separate from StatusBadge (that one speaks GitHub
// Actions' run/conclusion vocabulary: queued/in_progress/success/failure,
// not AWS resource states like running/stopped/pending).
export default function StateBadge({ state }) {

    const value = (state || "").toLowerCase();

    const className = value === "running" || value === "active" || value === "available" || value === "completed"
        ? "badge badge-success"
        : value === "stopped" || value === "inactive"
            ? "badge badge-secondary"
            : value === "failed" || value === "shutting-down" || value === "terminated"
                ? "badge badge-danger"
                : "badge badge-warning";

    return <span className={className}>{state}</span>;

}
