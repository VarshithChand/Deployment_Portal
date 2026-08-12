// GitHub's own username rules: alphanumeric segments separated by single
// hyphens, no leading/trailing hyphen, 1-39 characters. Shared by the
// header search bar and Settings' GitHub username lookup, both of which
// need to tell "this looks like a username" apart from "this looks like a
// repo URL" (see parseRepoUrl) before firing an API call.
const USERNAME_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export default function isValidGitHubUsername(value) {
    return USERNAME_PATTERN.test(value);
}
