import DatabaseConnectionForm from "../../database/DatabaseConnectionForm";
import {
    getDatabaseConnectionStatus, saveDatabaseConnection, saveDatabaseConnectionFields, clearDatabaseConnection,
    getRenderDatabases, connectRenderDatabase
} from "../../../services/hostingObservabilityService";

// Points the Hosting Providers dashboard's Database tab at a specific
// Postgres instance - and ONLY that. This is the one place to connect it;
// Settings > Database's own separate connection (its table browser/editor)
// lives directly on that page instead (see settings/DatabaseConnectionSection.jsx)
// and is never affected by anything done here, or vice versa - two
// independent credentials, confirmed explicitly with the user rather than
// sharing one. See HostingObservabilityController's database/* actions.
export default function DatabaseConnectionSection() {

    return (

        <DatabaseConnectionForm
            description={
                "Points the Hosting Providers dashboard's Database tab at a specific Postgres " +
                "instance — required before that tab shows anything, even for the super-admin. " +
                "The connection string is only ever used server-side to run read queries — never " +
                "sent to the browser, and never shown back once saved."
            }
            fallbackNote={'the Database tab shows "not connected" again until you connect one here.'}
            getStatus={getDatabaseConnectionStatus}
            saveConnection={saveDatabaseConnection}
            saveConnectionFields={saveDatabaseConnectionFields}
            clearConnection={clearDatabaseConnection}
            getRenderDatabases={getRenderDatabases}
            connectRenderDatabase={connectRenderDatabase}
        />

    );

}
