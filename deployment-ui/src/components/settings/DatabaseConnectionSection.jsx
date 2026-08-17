import DatabaseConnectionForm from "../database/DatabaseConnectionForm";
import {
    getDatabaseConnectionStatus, saveDatabaseConnection, saveDatabaseConnectionFields, clearDatabaseConnection,
    getRenderDatabases, connectRenderDatabase
} from "../../services/databaseService";

// Settings > Database's OWN connection - independent of, and never shared
// with, the Hosting Providers dashboard's Database tab (see
// credentials/DatabaseConnectionSection.jsx, a completely separate
// credential connected from Settings > Credentials instead). Even the
// super-admin has to connect this explicitly before the table browser/
// editor below shows anything - no implicit DATABASE_URL access anymore
// (see DatabaseController's connection/* actions).
export default function DatabaseConnectionSection({ onChanged }) {

    return (

        <DatabaseConnectionForm
            onChanged={onChanged}
            description={
                "Connects Settings → Database's table browser/editor to a specific Postgres " +
                "instance — required even for the super-admin, no automatic DATABASE_URL access. " +
                "Independent of the Hosting Providers dashboard's own Database connection " +
                "(Settings → Credentials → Database) — connecting or clearing one never touches " +
                "the other. The connection string is only ever used server-side — never sent to " +
                "the browser, and never shown back once saved."
            }
            fallbackNote="this page is disconnected again until you connect a database here."
            getStatus={getDatabaseConnectionStatus}
            saveConnection={saveDatabaseConnection}
            saveConnectionFields={saveDatabaseConnectionFields}
            clearConnection={clearDatabaseConnection}
            getRenderDatabases={getRenderDatabases}
            connectRenderDatabase={connectRenderDatabase}
        />

    );

}
