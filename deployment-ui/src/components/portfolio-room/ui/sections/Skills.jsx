import { SKILL_GROUPS } from "../../data/skills";

export default function Skills() {

    return (

        <div className="proom-skills">
            {SKILL_GROUPS.map((group) => (
                <div key={group.key} className="proom-skills-group">
                    <h3>{group.label}</h3>
                    <div className="proom-skills-tags">
                        {group.items.map((item) => (
                            <span key={item} className="proom-tag">{item}</span>
                        ))}
                    </div>
                </div>
            ))}
        </div>

    );

}
