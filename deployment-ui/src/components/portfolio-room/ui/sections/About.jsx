import { ABOUT } from "../../data/profile";

// The trailing role line this used to end with duplicated text already
// shown two lines up in the "$ whoami" block itself (ABOUT.whoami
// already includes the role) - same content, twice, once inside the
// terminal-styled block and once floating below it as an afterthought.
export default function About() {

    return (

        <div className="proom-terminal mono">
            {ABOUT.whoami.map((block, i) => (
                <div key={i} className="proom-terminal-block">
                    {block.prompt && <div className="proom-terminal-prompt">{block.prompt}</div>}
                    {block.lines.map((line) => <div key={line} className="proom-terminal-line">{line}</div>)}
                </div>
            ))}
            <div className="proom-terminal-block">
                <div className="proom-terminal-prompt">&gt; Explore my work</div>
            </div>
        </div>

    );

}
