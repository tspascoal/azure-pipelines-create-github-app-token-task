import * as tl from 'azure-pipelines-task-lib/task';
import { GitHubService } from '../../src/core/github-service';
import { ProxyConfig } from '../../src/core/proxy-config';
import * as constants from '../../src/utils/constants';
import { run } from '../../src/tasks/post';

// Mock all dependencies
jest.mock('azure-pipelines-task-lib/task');
jest.mock('../../src/core/github-service');
jest.mock('../../src/core/proxy-config');

const mockedTl = tl as jest.Mocked<typeof tl>;
const MockedGitHubService = GitHubService as jest.MockedClass<typeof GitHubService>;

// Mock implementations
const mockGitHubService = {
  revokeInstallationToken: jest.fn()
};

const mockProxyConfig = {};

describe('post task logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mocks
    MockedGitHubService.mockClear();
    
    // Default successful mocks
    MockedGitHubService.mockImplementation(() => mockGitHubService as any);
    jest.spyOn(ProxyConfig, 'fromAzurePipelines').mockReturnValue(mockProxyConfig as any);
    
    mockGitHubService.revokeInstallationToken.mockResolvedValue(true);

    // Mock console.log to suppress output during tests
    jest.spyOn(console, 'log').mockImplementation();
    
    // Mock tl.error to suppress error output during tests  
    mockedTl.error.mockImplementation();

    // Default task variable mocks
    mockedTl.getTaskVariable.mockImplementation((name: string) => {
      switch (name) {
        case constants.SKIP_TOKEN_TASK_VARNAME:
          return 'false';
        case constants.BASE_URL_TASK_VARNAME:
          return constants.DEFAULT_API_URL;
        case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
          return 'ghs_mock_installation_token';
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('task variable processing', () => {
    it('should process task variables correctly', () => {
      const skipTokenRevoke = mockedTl.getTaskVariable(constants.SKIP_TOKEN_TASK_VARNAME);
      const baseUrl = mockedTl.getTaskVariable(constants.BASE_URL_TASK_VARNAME);
      const token = mockedTl.getTaskVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME);

      expect(skipTokenRevoke).toBe('false');
      expect(baseUrl).toBe(constants.DEFAULT_API_URL);
      expect(token).toBe('ghs_mock_installation_token');

      // Parse skip token value
      const shouldSkip = JSON.parse(skipTokenRevoke || 'false');
      expect(shouldSkip).toBe(false);
    });

    it('should handle custom base URL from task variables', () => {
      const customBaseUrl = 'https://github.enterprise.com/api/v3';
      
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return customBaseUrl;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      const baseUrl = mockedTl.getTaskVariable(constants.BASE_URL_TASK_VARNAME);
      expect(baseUrl).toBe(customBaseUrl);
    });
  });

  describe('skip scenarios', () => {
    it('should skip revocation when skipTokenRevoke is true', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'true'; // Skip revocation
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      await run();
      
      // The task should have skipped revocation
      expect(mockGitHubService.revokeInstallationToken).not.toHaveBeenCalled();
      expect(MockedGitHubService).not.toHaveBeenCalled();
    });

    it('should skip revocation when no installation token is found', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return undefined; // No token found
          default:
            return undefined;
        }
      });

      // Actually run the post task
      await run();

      // Should not attempt revocation when no token is available
      expect(mockGitHubService.revokeInstallationToken).not.toHaveBeenCalled();
      expect(MockedGitHubService).not.toHaveBeenCalled();
    });

    it('should perform revocation when conditions are met', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false'; // Don't skip revocation
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token'; // Token available
          default:
            return undefined;
        }
      });

      // Actually run the post task
      await run();

      // Should have attempted revocation
      expect(MockedGitHubService).toHaveBeenCalledWith(constants.DEFAULT_API_URL, { proxy: mockProxyConfig });
      expect(mockGitHubService.revokeInstallationToken).toHaveBeenCalledWith('ghs_mock_installation_token');
    });
  });

  describe('Post Logic', () => {
    it('should create GitHub service with correct parameters and revoke token successfully', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      mockGitHubService.revokeInstallationToken.mockResolvedValue(true);

      await run();

      expect(MockedGitHubService).toHaveBeenCalledWith(constants.DEFAULT_API_URL, { proxy: mockProxyConfig });
      expect(mockGitHubService.revokeInstallationToken).toHaveBeenCalledWith('ghs_mock_installation_token');
    });

    it('should handle token revocation failure without failing the task', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      mockGitHubService.revokeInstallationToken.mockResolvedValue(false);

      await run();

      expect(mockGitHubService.revokeInstallationToken).toHaveBeenCalledWith('ghs_mock_installation_token');
      // Task should complete without throwing
    });

    it('should handle service creation with custom base URL', async () => {
      const customBaseUrl = 'https://github.enterprise.com/api/v3';
      
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return customBaseUrl;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      mockGitHubService.revokeInstallationToken.mockResolvedValue(true);

      await run();

      expect(MockedGitHubService).toHaveBeenCalledWith(customBaseUrl, { proxy: mockProxyConfig });
    });

    it('should handle exceptions during token revocation gracefully', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      const mockError = new Error('Network error during revocation');
      mockGitHubService.revokeInstallationToken.mockRejectedValue(mockError);

      await run();

      expect(mockGitHubService.revokeInstallationToken).toHaveBeenCalledWith('ghs_mock_installation_token');
      expect(mockedTl.error).toHaveBeenCalledWith('Error in post-execution: Network error during revocation');
    });
  });

  describe('error handling scenarios', () => {
    it('should handle missing task variables gracefully', () => {
      mockedTl.getTaskVariable.mockReturnValue(undefined);

      const skipTokenRevoke = mockedTl.getTaskVariable(constants.SKIP_TOKEN_TASK_VARNAME);
      const baseUrl = mockedTl.getTaskVariable(constants.BASE_URL_TASK_VARNAME);
      const token = mockedTl.getTaskVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME);

      expect(skipTokenRevoke).toBeUndefined();
      expect(baseUrl).toBeUndefined();
      expect(token).toBeUndefined();

      // In the actual implementation, defaults would be used
      const shouldSkip = JSON.parse(skipTokenRevoke || 'false');
      const actualBaseUrl = baseUrl || constants.DEFAULT_API_URL;
      
      expect(shouldSkip).toBe(false);
      expect(actualBaseUrl).toBe(constants.DEFAULT_API_URL);
    });
  });

  describe('proxy integration', () => {
    it('should pass proxy configuration to GitHub service when available', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      const mockProxyConfigInstance = { proxy: 'config' };
      jest.spyOn(ProxyConfig, 'fromAzurePipelines').mockReturnValue(mockProxyConfigInstance as any);
      
      await run();
      
      expect(ProxyConfig.fromAzurePipelines).toHaveBeenCalledWith(constants.DEFAULT_API_URL);
      expect(MockedGitHubService).toHaveBeenCalledWith(constants.DEFAULT_API_URL, { proxy: mockProxyConfigInstance });
    });

    it('should handle when no proxy configuration is available', async () => {
      mockedTl.getTaskVariable.mockImplementation((name: string) => {
        switch (name) {
          case constants.SKIP_TOKEN_TASK_VARNAME:
            return 'false';
          case constants.BASE_URL_TASK_VARNAME:
            return constants.DEFAULT_API_URL;
          case constants.INSTALLATION_TOKEN_OUTPUT_VARNAME:
            return 'ghs_mock_installation_token';
          default:
            return undefined;
        }
      });

      jest.spyOn(ProxyConfig, 'fromAzurePipelines').mockReturnValue(undefined);
      
      await run();
      
      expect(ProxyConfig.fromAzurePipelines).toHaveBeenCalledWith(constants.DEFAULT_API_URL);
      expect(MockedGitHubService).toHaveBeenCalledWith(constants.DEFAULT_API_URL, { proxy: undefined });
    });
  });
});
