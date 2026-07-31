import healthApi from "../api/healthApi";

// A 503 from /api/health/db is a real, expected response (the database
// is genuinely unreachable) - axios throws on it like any other non-2xx,
// so both branches return the same { ...data, httpStatus } shape rather
// than making callers tell "resolved" and "rejected" apart themselves.
async function getWithStatus(path) {

    try {

        const response = await healthApi.get(path);
        return { ...response.data, httpStatus: response.status };

    }
    catch (err) {

        if (err.response) {
            return { ...err.response.data, httpStatus: err.response.status };
        }

        throw err;

    }

}

export const getBackendHealth = () => getWithStatus("/");

export const getDatabaseHealth = () => getWithStatus("/db");
