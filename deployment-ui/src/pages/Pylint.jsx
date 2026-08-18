import PageLayout from "../components/layout/PageLayout";
import ComingSoonTool from "../components/codeQuality/ComingSoonTool";

export default function Pylint() {

    return (

        <PageLayout title="Pylint">
            <ComingSoonTool
                name="Pylint"
                description="Would need downloading and parsing a pylint-report artifact from your CI."
            />
        </PageLayout>

    );

}
