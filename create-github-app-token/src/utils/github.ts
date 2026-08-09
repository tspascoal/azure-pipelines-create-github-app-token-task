/**
 * Extracts the repository name from a GitHub repository's "name with owner" (NWO) string.
 *
 * @param nwo - The "name with owner" string in the format "owner/repo".
 * @returns The repository name (the part after the slash).
 */
export function getRepoName(nwo: string) {
  return nwo.split("/")[1];
}

/**
 * Extracts the owner name from a GitHub repository's "name with owner" (NWO) string.
 *
 * @param nwo - The "name with owner" string in the format "owner/repo".
 * @returns The owner name (the part before the slash).
 */
export function getOwnerName(nwo: string) {
  return nwo.split("/")[0];
}

/**
 * Normalizes a GitHub API base URL for use when constructing request URLs.
 */
export function normalizeGitHubApiUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * Derives the GitHub hostname expected by GitHub CLI from an API base URL.
 */
export function getGitHubHost(apiUrl: string) {
  const apiHostname = new URL(apiUrl).hostname;

  return apiHostname === 'api.github.com' || (apiHostname.startsWith('api.') && apiHostname.endsWith('.ghe.com'))
    ? apiHostname.substring(4)
    : apiHostname;
}
