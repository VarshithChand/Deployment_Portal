import { Folder, FileCode } from "lucide-react";

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

// Builds a nested {folders, files} tree from a flat list of "/"-separated
// paths (exactly what TerraformProjectDetailDto.Files already is - no
// backend change needed, this is purely a client-side view over the same
// flat list TerraformFilesSection used to render as a table).
function buildTree(files) {

    const root = { folders: new Map(), files: [] };

    for (const file of files) {

        const parts = file.fileName.split("/");
        let node = root;

        parts.forEach((part, i) => {

            const isFile = i === parts.length - 1;

            if (isFile) {
                node.files.push({ ...file, label: part });
                return;
            }

            if (!node.folders.has(part)) {
                node.folders.set(part, { folders: new Map(), files: [] });
            }

            node = node.folders.get(part);

        });

    }

    return root;

}

function TreeNode({ node, depth, selectedPath, onSelect }) {

    const folderEntries = [...node.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const fileEntries = [...node.files].sort((a, b) => a.label.localeCompare(b.label));

    return (

        <>

            {folderEntries.map(([name, child]) => (

                <div key={name}>

                    <div
                        className="terraform-tree-row terraform-tree-folder"
                        style={{ paddingLeft: 10 + depth * 16 }}
                    >
                        <Folder size={14} style={{ marginRight: 6, verticalAlign: -2, flexShrink: 0 }} />
                        {name}
                    </div>

                    <TreeNode node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />

                </div>

            ))}

            {fileEntries.map((file) => (

                <button
                    key={file.fileName}
                    type="button"
                    className={`terraform-tree-row terraform-tree-file ${selectedPath === file.fileName ? "terraform-tree-file-selected" : ""}`}
                    style={{ paddingLeft: 10 + depth * 16 }}
                    onClick={() => onSelect(file.fileName)}
                >
                    <FileCode size={14} style={{ marginRight: 6, verticalAlign: -2, flexShrink: 0 }} />
                    <span className="terraform-tree-file-label">{file.label}</span>
                    <span className="terraform-tree-file-size">{formatSize(file.contentLength)}</span>
                </button>

            ))}

        </>

    );

}

export default function TerraformFileTree({ files, selectedPath, onSelect }) {

    if (files.length === 0) {
        return <p className="empty-state">No files in this project yet.</p>;
    }

    const tree = buildTree(files);

    return (

        <div className="terraform-tree">
            <TreeNode node={tree} depth={0} selectedPath={selectedPath} onSelect={onSelect} />
        </div>

    );

}
