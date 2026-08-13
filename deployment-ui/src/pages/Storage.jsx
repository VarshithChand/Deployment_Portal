import { useEffect, useState } from "react";

import { getArtifacts, getDockerImages, deleteArtifact } from "../services/githubService";
import { getSettings } from "../services/settingsService";

import LoadingSpinner from "../components/LoadingSpinner";
import RequireRepoSelected from "../components/RequireRepoSelected";
import PageLayout from "../components/layout/PageLayout";
import PageAdminAccessButton from "../components/common/PageAdminAccessButton";
import ArtifactsTable from "../components/storage/ArtifactsTable";
import DockerImagesTable from "../components/storage/DockerImagesTable";
import useToast from "../hooks/useToast";
import useConfirm from "../hooks/useConfirm";

export default function Storage() {

    const [owner, setOwner] = useState("");
    const [repository, setRepository] = useState("");

    const [artifacts, setArtifacts] = useState([]);
    const [images, setImages] = useState([]);

    const [loading, setLoading] = useState(true);
    const [imagesError, setImagesError] = useState("");
    const [deletingId, setDeletingId] = useState(null);

    const toast = useToast();
    const { confirm, dialog } = useConfirm();

    async function load() {

        try {

            setLoading(true);

            const [settings, artifactsResponse] = await Promise.all([
                getSettings(),
                getArtifacts()
            ]);

            setOwner(settings.gitHubOwner || "");
            setRepository(settings.gitHubRepository || "");

            setArtifacts(
                Array.isArray(artifactsResponse.data) ? artifactsResponse.data : []
            );

            try {

                const imagesResponse = await getDockerImages();

                setImages(
                    Array.isArray(imagesResponse.data) ? imagesResponse.data : []
                );

                setImagesError("");

            }
            catch (err) {

                console.error(err);
                setImages([]);
                setImagesError(
                    err.response?.data?.message
                        || "Unable to load container images for this owner."
                );

            }

        }
        catch (err) {

            console.error(err);

        }
        finally {

            setLoading(false);

        }

    }

    useEffect(() => {

        load();

    }, []);

    async function handleDeleteArtifact(artifact) {

        if (!(await confirm({
            title: "Delete artifact?",
            message: `Delete artifact "${artifact.name}"? This cannot be undone.`,
            confirmLabel: "Delete",
            danger: true
        }))) {
            return;
        }

        try {

            setDeletingId(artifact.id);

            await deleteArtifact(artifact.id);

            setArtifacts((prev) => prev.filter((a) => a.id !== artifact.id));
            toast.show(`Deleted "${artifact.name}".`, "success");

        }
        catch (err) {

            console.error(err);
            toast.show(
                err.response?.data?.message || "Failed to delete artifact.",
                "error"
            );

        }
        finally {

            setDeletingId(null);

        }

    }

    if (loading) {
        return <LoadingSpinner />;
    }

    return (

        <PageLayout title="Artifacts & Images" actions={<PageAdminAccessButton pageKey="storage" pageLabel="Artifacts & Images" />}>

            {dialog}

            <RequireRepoSelected>

                <ArtifactsTable
                    artifacts={artifacts}
                    owner={owner}
                    repository={repository}
                    onDelete={handleDeleteArtifact}
                    deletingId={deletingId}
                />

                <br />

                {imagesError && (
                    <div className="error-message">
                        {imagesError}
                    </div>
                )}

                <DockerImagesTable
                    images={images}
                    owner={owner}
                />

            </RequireRepoSelected>

        </PageLayout>

    );

}
