import * as constants from '../../src/utils/constants';

describe('constants', () => {
  describe('API constants', () => {
    it('should define default API URL', () => {
      expect(constants.DEFAULT_API_URL).toBe('https://api.github.com');
    });

    it('should define JWT expiration as 10 minutes in seconds', () => {
      expect(constants.JWT_EXPIRATION).toBe(10 * 60);
    });
    
    it('should define JWT clock skew tolerance', () => {
      expect(constants.JWT_CLOCK_DRIFT_SECONDS).toBe(60);
    });
  });

  describe('output variable names', () => {
    it('should define installation ID output variable name', () => {
      expect(constants.INSTALLATIONID_OUTPUT_VARNAME).toBe('installationId');
    });

    it('should define installation token output variable name', () => {
      expect(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME).toBe('installationToken');
    });

    it('should define token expiration output variable name', () => {
      expect(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME).toBe('tokenExpiration');
    });
  });

  describe('task variable names', () => {
    it('should define skip token task variable name', () => {
      expect(constants.SKIP_TOKEN_TASK_VARNAME).toBe('skipTokenRevoke');
    });

    it('should define base URL task variable name', () => {
      expect(constants.BASE_URL_TASK_VARNAME).toBe('baseUrl');
    });
  });

  describe('account type constants', () => {
    it('should define user account type', () => {
      expect(constants.ACCOUNT_TYPE_USER).toBe('user');
    });

    it('should define organization account type', () => {
      expect(constants.ACCOUNT_TYPE_ORG).toBe('org');
    });

    it('should define enterprise account type', () => {
      expect(constants.ACCOUNT_TYPE_ENTERPRISE).toBe('enterprise');
    });

    
  });
});
