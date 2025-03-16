/**
 * Extracts the repository name from a GitHub repository's "name with owner" (NWO) string.
 *
 * @param nwo - The "name with owner" string in the format "owner/repo".
 * @returns The repository name (the part after the slash).
 */
export function getRepoName(nwo: string) {
  return nwo.split("/")[1];
}
