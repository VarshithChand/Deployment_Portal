// Section 21's "what's connected to what" - a plain flex arrow-chain, not
// a graph library (section 14/29's "no unnecessary dependencies" - this
// app has no diagramming dependency anywhere and one linear chain doesn't
// need one). Renders whatever items the caller already resolved from a
// resource's own detail response (VPC/Subnet/SecurityGroup/Instance, or
// the Azure/GCP equivalents) - entries with no id are shown as plain text,
// nothing to click through to.
export default function RelationshipDiagram({ items }) {

    const visible = (items || []).filter((item) => item.label);

    if (visible.length === 0) {
        return null;
    }

    return (

        <div className="card">

            <h3 className="settings-subhead" style={{ marginTop: 0 }}>Relationships</h3>

            <div className="cloud-service-relationship-chain">

                {visible.map((item, index) => (

                    <div className="cloud-service-relationship-node-row" key={`${item.label}-${index}`}>

                        <div className="cloud-service-relationship-node">
                            <span className="field-hint" style={{ margin: 0 }}>{item.kind}</span>
                            <strong>{item.label}</strong>
                        </div>

                        {index < visible.length - 1 && <span className="cloud-service-relationship-arrow" aria-hidden="true">↓</span>}

                    </div>

                ))}

            </div>

        </div>

    );

}
