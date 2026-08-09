import { getGitHubHost, getRepoName, getOwnerName, normalizeGitHubApiUrl } from '../../src/utils/github';

describe('github utilities', () => {
  describe('getRepoName', () => {
    it('should extract repository name from owner/repo format', () => {
      const result = getRepoName('microsoft/vscode');
      expect(result).toBe('vscode');
    });

    it('should handle repository names with special characters', () => {
      const result = getRepoName('org/repo-name.with_dots');
      expect(result).toBe('repo-name.with_dots');
    });
  });

  describe('getOwnerName', () => {
    it('should extract owner name from owner/repo format', () => {
      const result = getOwnerName('microsoft/vscode');
      expect(result).toBe('microsoft');
    });

    it('should handle owner names with special characters', () => {
      const result = getOwnerName('org-name_with.dots/repo');
      expect(result).toBe('org-name_with.dots');
    });
  });

  describe('normalizeGitHubApiUrl', () => {
    it('should trim whitespace and trailing slashes', () => {
      expect(normalizeGitHubApiUrl('  https://github.example.com/api/v3///  ')).toBe('https://github.example.com/api/v3');
    });
  });

  describe('getGitHubHost', () => {
    it.each([
      ['GitHub Enterprise Cloud', 'https://api.github.com', 'github.com'],
      ['GitHub Enterprise Cloud with data residency', 'https://api.company.ghe.com', 'company.ghe.com'],
      ['GitHub Enterprise Server', 'https://github.company.com/api/v3', 'github.company.com']
    ])('should derive the host for %s', (_scenario, apiUrl, expectedHost) => {
      expect(getGitHubHost(apiUrl)).toBe(expectedHost);
    });
  });
});
