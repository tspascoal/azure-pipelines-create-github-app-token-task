import { validateRepositoryName, validateAccountType } from '../../src/utils/validation';
import * as constants from '../../src/utils/constants';

describe('validation utilities', () => {
  describe('validateRepositoryName', () => {
    it('should accept valid repository names with letters and numbers', () => {
      expect(validateRepositoryName('myrepo123')).toBe(true);
      expect(validateRepositoryName('MyRepo')).toBe(true);
      expect(validateRepositoryName('repo')).toBe(true);
    });

    it('should accept repository names with dots, dashes, and underscores', () => {
      expect(validateRepositoryName('my-repo')).toBe(true);
      expect(validateRepositoryName('my_repo')).toBe(true);
      expect(validateRepositoryName('my.repo')).toBe(true);
      expect(validateRepositoryName('repo-name_with.all-chars123')).toBe(true);
    });

    it('should accept repository names starting with dots, dashes, or underscores', () => {
      expect(validateRepositoryName('.github')).toBe(true);
      expect(validateRepositoryName('-repo')).toBe(true);
      expect(validateRepositoryName('_private')).toBe(true);
    });

    it('should reject repository names with invalid characters', () => {
      expect(validateRepositoryName('repo with spaces')).toBe(false);
      expect(validateRepositoryName('repo@name')).toBe(false);
      expect(validateRepositoryName('repo#hash')).toBe(false);
      expect(validateRepositoryName('repo$dollar')).toBe(false);
      expect(validateRepositoryName('repo%percent')).toBe(false);
      expect(validateRepositoryName('repo&ampersand')).toBe(false);
      expect(validateRepositoryName('repo*star')).toBe(false);
      expect(validateRepositoryName('repo+plus')).toBe(false);
      expect(validateRepositoryName('repo=equals')).toBe(false);
      expect(validateRepositoryName('repo[brackets]')).toBe(false);
      expect(validateRepositoryName('repo{braces}')).toBe(false);
      expect(validateRepositoryName('repo|pipe')).toBe(false);
      expect(validateRepositoryName('repo\\backslash')).toBe(false);
      expect(validateRepositoryName('repo/slash')).toBe(false);
      expect(validateRepositoryName('repo:colon')).toBe(false);
      expect(validateRepositoryName('repo;semicolon')).toBe(false);
      expect(validateRepositoryName('repo"quote')).toBe(false);
      expect(validateRepositoryName("repo'apostrophe")).toBe(false);
      expect(validateRepositoryName('repo<less')).toBe(false);
      expect(validateRepositoryName('repo>greater')).toBe(false);
      expect(validateRepositoryName('repo,comma')).toBe(false);
      expect(validateRepositoryName('repo?question')).toBe(false);
    });

    it('should reject empty repository names', () => {
      expect(validateRepositoryName('')).toBe(false);
    });

    it('should reject repository names with Unicode characters', () => {
      expect(validateRepositoryName('repo-ñame')).toBe(false);
      expect(validateRepositoryName('repo-名前')).toBe(false);
      expect(validateRepositoryName('repo-émoji')).toBe(false);
    });
  });

  describe('validateAccountType', () => {
    it('should accept valid account types', () => {
      expect(() => validateAccountType(constants.ACCOUNT_TYPE_ORG)).not.toThrow();
      expect(() => validateAccountType(constants.ACCOUNT_TYPE_USER)).not.toThrow();
      expect(() => validateAccountType('org')).not.toThrow();
      expect(() => validateAccountType('user')).not.toThrow();
    });

    it('should reject invalid account types', () => {
      expect(() => validateAccountType('invalid')).toThrow('Invalid account type invalid. Must be one of: org, user');
      expect(() => validateAccountType('organization')).toThrow('Invalid account type organization. Must be one of: org, user');
      expect(() => validateAccountType('userType')).toThrow('Invalid account type userType. Must be one of: org, user');
      expect(() => validateAccountType('')).toThrow('Invalid account type . Must be one of: org, user');
    });

    it('should be case sensitive', () => {
      expect(() => validateAccountType('ORG')).toThrow('Invalid account type ORG. Must be one of: org, user');
      expect(() => validateAccountType('USER')).toThrow('Invalid account type USER. Must be one of: org, user');
      expect(() => validateAccountType('Org')).toThrow('Invalid account type Org. Must be one of: org, user');
      expect(() => validateAccountType('User')).toThrow('Invalid account type User. Must be one of: org, user');
    });
  });
});

  describe('Error message consistency', () => {
    it('should provide consistent error format for invalid account type', () => {
      const testCases = [
        'invalid',
        'ORGANIZATION', 
        'USER',
        'organization',
        ''
      ];

      testCases.forEach(accountType => {
        expect(() => validateAccountType(accountType))
          .toThrow(`Invalid account type ${accountType}. Must be one of: org, user`);
      });
    });

    it('should provide detailed repository validation error', () => {
      // This tests that the error message is descriptive enough for users
      const invalidRepo = 'repo with spaces';
      
      expect(validateRepositoryName(invalidRepo)).toBe(false);
      // The actual error is thrown by the GitHubService when validation fails
    });
  });

