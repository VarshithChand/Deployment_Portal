import api from "../api/databaseApi";

// Every one of these hits api/database/*, which is restricted server-side
// to one specific GitHub identity regardless of general admin status (see
// AdminGate.DenyUnlessSuperAdminAsync) - a 403 here is expected for anyone
// else and is handled by the pages that call these, not here.

export const getDatabaseHealth = async () => {
    const response = await api.get("/health");
    return response.data;
};

export const getDatabaseSchemas = async () => {
    const response = await api.get("/schemas");
    return response.data;
};

export const getDatabaseTables = async (schema) => {
    const response = await api.get("/tables", { params: { schema } });
    return response.data;
};

export const getDatabaseOverview = async () => {
    const response = await api.get("/overview");
    return response.data;
};

export const getDatabaseTableDetail = async (schema, table) => {
    const response = await api.get(`/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`);
    return response.data;
};

// Server-side pagination - the one explicit exception to this project's
// client-side pagination policy, since a Postgres table can be arbitrarily
// large (see DatabaseManagementService.GetRowsAsync).
export const getDatabaseRows = async (schema, table, page, pageSize, search) => {
    const response = await api.get(`/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`, {
        params: { page, pageSize, search: search || undefined }
    });
    return response.data;
};

export const insertDatabaseRow = async (schema, table, values) => {
    const response = await api.post("/rows", { schema, table, values });
    return response.data;
};

export const updateDatabaseRow = async (schema, table, primaryKeyColumn, primaryKeyValue, values) => {
    const response = await api.put("/rows", { schema, table, primaryKeyColumn, primaryKeyValue, values });
    return response.data;
};

export const deleteDatabaseRow = async (schema, table, primaryKeyColumn, primaryKeyValue) => {
    const response = await api.delete("/rows", { data: { schema, table, primaryKeyColumn, primaryKeyValue } });
    return response.data;
};

export const createDatabaseTable = async (schema, tableName, columns) => {
    const response = await api.post("/tables", { schema, tableName, columns });
    return response.data;
};
