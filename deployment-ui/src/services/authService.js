import authApi from "../api/authApi";

export const getMe = async () => {

    try {

        const response = await authApi.get("/me");
        return response.data;

    }
    catch {

        return null;

    }

};

export const logout = async () => {

    await authApi.post("/logout");

};

// Anonymous, cheap, no external calls - safe to poll frequently. See
// SettingsService.BumpForceLogoutEpochAsync for what changes this value.
export const getSessionEpoch = async () => {

    const response = await authApi.get("/session-epoch");
    return response.data.forceLogoutEpoch;

};
