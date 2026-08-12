// A minimal, deliberately safe markdown-lite renderer (section 30) —
// headings, bullet/numbered lists, inline code, and bold, built as real
// React elements rather than ever touching dangerouslySetInnerHTML. There
// is no path from Gemini's raw text output to the DOM as HTML at all, so
// there's nothing here that needs a sanitizer - the "sanitizing" is that
// the renderer only ever produces the handful of element types below.

function renderInline(text, keyPrefix) {

    const nodes = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = pattern.exec(text)) !== null) {

        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }

        const token = match[0];

        if (token.startsWith("**")) {
            nodes.push(<strong key={`${keyPrefix}-${key++}`}>{token.slice(2, -2)}</strong>);
        }
        else {
            nodes.push(<code key={`${keyPrefix}-${key++}`}>{token.slice(1, -1)}</code>);
        }

        lastIndex = match.index + token.length;

    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes;

}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const NUMBERED_RE = /^\d+\.\s+(.*)$/;
const BLOCK_START_RE = /^([-*]|\d+\.|#{1,3})\s+/;

export default function CopilotMarkdown({ text }) {

    const lines = (text || "").split("\n");
    const blocks = [];
    let i = 0;
    let blockKey = 0;

    while (i < lines.length) {

        const line = lines[i];
        const heading = line.match(HEADING_RE);

        if (heading) {

            const level = heading[1].length;
            const Tag = level === 1 ? "h4" : level === 2 ? "h5" : "h6";
            const key = blockKey++;

            blocks.push(<Tag key={key}>{renderInline(heading[2], key)}</Tag>);
            i++;
            continue;

        }

        if (BULLET_RE.test(line)) {

            const items = [];

            while (i < lines.length && BULLET_RE.test(lines[i])) {
                items.push(lines[i].match(BULLET_RE)[1]);
                i++;
            }

            const key = blockKey++;

            blocks.push(
                <ul key={key}>
                    {items.map((item, idx) => <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>)}
                </ul>
            );

            continue;

        }

        if (NUMBERED_RE.test(line)) {

            const items = [];

            while (i < lines.length && NUMBERED_RE.test(lines[i])) {
                items.push(lines[i].match(NUMBERED_RE)[1]);
                i++;
            }

            const key = blockKey++;

            blocks.push(
                <ol key={key}>
                    {items.map((item, idx) => <li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>)}
                </ol>
            );

            continue;

        }

        if (line.trim() === "") {
            i++;
            continue;
        }

        const paragraphLines = [];

        while (i < lines.length && lines[i].trim() !== "" && !BLOCK_START_RE.test(lines[i])) {
            paragraphLines.push(lines[i]);
            i++;
        }

        const key = blockKey++;

        blocks.push(<p key={key}>{renderInline(paragraphLines.join(" "), key)}</p>);

    }

    return <div className="copilot-markdown">{blocks}</div>;

}
