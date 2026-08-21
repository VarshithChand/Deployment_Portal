import CopyButton from "../common/CopyButton";

export default function ImagesSection({ images, actingId, handleRemoveImage }) {

    return (

        <>

        <h2 className="card-title">Images</h2>

        {images.length === 0 ? (

            <p className="empty-state">No images found on this host.</p>

        ) : (

            <div className="table-scroll">

            <table className="table">

                <thead>
                    <tr>
                        <th>Tags</th>
                        <th>Size</th>
                        <th>Created</th>
                        <th><span className="visually-hidden">Actions</span></th>
                    </tr>
                </thead>

                <tbody>

                    {images.map((img) => (

                        <tr key={img.id}>
                            <td>
                                {img.tags.length > 0 ? img.tags.join(", ") : <em>untagged</em>}
                                <CopyButton value={img.id} label="Copy image ID" />
                            </td>
                            <td>{(img.sizeBytes / (1024 * 1024)).toFixed(1)} MB</td>
                            <td>{new Date(img.createdAt).toLocaleString()}</td>
                            <td>
                                <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemoveImage(img.id, img.tags[0])}
                                    disabled={actingId === img.id}
                                >
                                    Remove
                                </button>
                            </td>
                        </tr>

                    ))}

                </tbody>

            </table>

            </div>

        )}

        </>

    );

}
