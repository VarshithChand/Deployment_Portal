// ESLint/Pylint/Checkstyle have no hosted API of their own to browse -
// unlike Sonar/CodeQL, the only real way to surface results would be
// downloading a workflow-run artifact and parsing a lint-report file out
// of it, which depends entirely on a repo's own CI actually producing one
// in a specific, knowable format/filename - not guessed at here. A real,
// visible placeholder rather than hiding the page or pretending it works.
export default function ComingSoonTool({ name, description }) {

    return (

        <div className="card">
            <h2 className="card-title">{name}</h2>
            <p className="empty-state" style={{ textAlign: "left" }}>
                Not built yet — coming in a later update. {description}
            </p>
        </div>

    );

}
