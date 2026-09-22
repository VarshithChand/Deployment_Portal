import { createApiClient } from "./apiBase";

// Separate from organizationsApi - accepting an invitation isn't org-
// scoped in the URL (see InvitationAcceptController's own comment), it
// resolves the org purely from the token itself.
export default createApiClient("/api/invitations");
