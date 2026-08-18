import PageLayout from "../components/layout/PageLayout";
import ComingSoonTool from "../components/codeQuality/ComingSoonTool";

export default function Eslint() {

    return (

        <PageLayout title="ESLint">
            <ComingSoonTool
                name="ESLint"
                description="Would need downloading and parsing an eslint-report.json artifact from your CI."
            />
        </PageLayout>

    );

}
