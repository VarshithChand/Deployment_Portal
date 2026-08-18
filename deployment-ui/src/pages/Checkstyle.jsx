import PageLayout from "../components/layout/PageLayout";
import ComingSoonTool from "../components/codeQuality/ComingSoonTool";

export default function Checkstyle() {

    return (

        <PageLayout title="Checkstyle">
            <ComingSoonTool
                name="Checkstyle"
                description="Would need downloading and parsing a checkstyle-report.xml artifact from your CI."
            />
        </PageLayout>

    );

}
