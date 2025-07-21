import { getRepoName, getOwnerName } from '../../src/utils/github';

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
});
