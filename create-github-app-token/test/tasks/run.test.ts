import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import { GitHubService } from '../../src/core/github-service';
import { ProxyConfig } from '../../src/core/proxy-config';
import * as constants from '../../src/utils/constants';
import { run } from '../../src/tasks/run';

// Mock all dependencies
jest.mock('azure-pipelines-task-lib/task');
jest.mock('fs');
jest.mock('../../src/core/github-service');
jest.mock('../../src/core/proxy-config');

const mockedTl = tl as jest.Mocked<typeof tl>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const MockedGitHubService = GitHubService as jest.MockedClass<typeof GitHubService>;

// Mock implementations
const mockGitHubService = {
  generateJWT: jest.fn(),
  getInstallationId: jest.fn(),
  getInstallationToken: jest.fn()
};

const mockProxyConfig = {};

describe('run task logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mocks
    MockedGitHubService.mockClear();
    
    // Default successful mocks
    MockedGitHubService.mockImplementation(() => mockGitHubService as any);
    jest.spyOn(ProxyConfig, 'fromAzurePipelines').mockReturnValue(mockProxyConfig as any);
    
    mockGitHubService.generateJWT.mockResolvedValue('mock.jwt.token');
    mockGitHubService.getInstallationId.mockResolvedValue(12345);
    mockGitHubService.getInstallationToken.mockResolvedValue({
      token: 'ghs_mock_installation_token',
      expiresAt: '2024-01-01T13:00:00Z'
    });

    // Mock console.log to suppress output during tests
    jest.spyOn(console, 'log').mockImplementation();
    
    // Default input mocks
    mockedTl.getVariable.mockImplementation((name: string) => {
      switch (name) {
        case 'Build.Repository.Provider':
          return 'GitHub';
        case 'Build.Repository.Name':
          return 'owner/repo';
        default:
          return undefined;
      }
    });

    mockedTl.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'accountType':
          return constants.ACCOUNT_TYPE_ORG;
        default:
          return '';
      }
    });

    mockedTl.getBoolInput.mockReturnValue(false);
    mockedTl.setResult.mockImplementation();
    mockedTl.setVariable.mockImplementation();
    mockedTl.setTaskVariable.mockImplementation();
    mockedTl.getEndpointAuthorization.mockReturnValue(undefined);
    mockedTl.warning.mockImplementation();
    mockedTl.error.mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful execution scenarios', () => {
    it('should complete successfully with service connection', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'url': 'https://api.github.com/'
        }
      } as any);

      await run();

      expect(MockedGitHubService).toHaveBeenCalledWith('https://api.github.com/', { proxy: mockProxyConfig });
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', 'mock-pem-key');
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'test-org', "org", []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);
      
      // Verify output variables are set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
    });

    it('should complete successfully with direct certificate input', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'owner':
        return 'test-org';
        case 'appClientId':
        return 'test-app-id';
        case 'certificate':
        return 'mock-pem-key';
        default:
        return '';
      }
      });

      await run();

      // Should generate JWT and proceed through the flow
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', 'mock-pem-key');
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'test-org', "org", []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);

      // Should set output variables
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);

      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should complete successfully with certificate file', async () => {
      const mockPemContent = '-----BEGIN RSA PRIVATE KEY-----\nmock-key\n-----END RSA PRIVATE KEY-----';
      
      mockedTl.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'owner':
        return 'test-org';
        case 'appClientId':
        return 'test-app-id';
        case 'certificateFile':
        return '/path/to/cert.pem';
        default:
        return '';
      }
      });

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(mockPemContent);

      await run();

      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/path/to/cert.pem', 'utf8');
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', mockPemContent);

      // Should proceed through the rest of the flow and set output variables
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'test-org', "org", []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);

      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);

      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should auto-extract owner from repository name when using GitHub provider', async () => {
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'GitHub';
          case 'Build.Repository.Name':
            return 'auto-owner/test-repo';
          default:
            return undefined;
        }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return ''; // No owner provided - should auto-extract
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      await run();

      // Verify the extracted owner is used correctly
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'auto-owner', "org", []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);
      
      // Verify successful completion with output variables set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should handle repositories list correctly', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'repositories':
            return 'repo1, repo2, repo3'; // Comma-separated with spaces
          default:
            return '';
        }
      });

      await run();

      // Verify repositories are parsed and trimmed correctly
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'test-org', "org", ['repo1', 'repo2', 'repo3']);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, ['repo1', 'repo2', 'repo3'], undefined);
      
      // Verify successful completion with output variables set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup  
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should handle permissions correctly', async () => {
      const permissions = { contents: 'read', issues: 'write' };
      
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'permissions':
            return JSON.stringify(permissions);
          default:
            return '';
        }
      });

      await run();

      // Verify permissions are parsed and used correctly
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], permissions);
      
      // Verify successful completion with output variables set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });
  });

  describe('validation scenarios', () => {
    it('should fail when no private key is provided', async () => {
      // Set up inputs with no private key sources
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
          case 'certificateFile':
          case 'githubAppConnection':
            return ''; // No private key sources
          default:
            return '';
        }
      });

      // Actually call the run function
      await run();

      // Verify it failed with the correct error message
      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Private key not provided. Please configure either a GitHub App service connection, certificate input, or certificate file path.'
      );
    });

    it('should fail when no app client ID is provided', async () => {
      // Set up inputs with private key but no app ID
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'certificate':
            return 'mock-pem-key';
          case 'appClientId':
          case 'githubAppConnection':
            return ''; // No app ID sources
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'App ID not provided. Please configure either a GitHub App service connection or app ID input.'
      );
    });

    it('should fail when owner is not provided and repository provider is not GitHub', async () => {
      // Set up non-GitHub provider
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'TfsGit';
          case 'Build.Repository.Name':
            return 'project/repo';
          default:
            return undefined;
        }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return ''; // No owner provided
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'If owner is not provided, the repository provider must be GitHub'
      );
    });

    it('should fail when certificate file does not exist', async () => {
      const nonExistentPath = '/nonexistent/cert.pem';
      
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificateFile':
            return nonExistentPath;
          default:
            return '';
        }
      });

      mockedFs.existsSync.mockReturnValue(false);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        `Private key not found in the path: ${nonExistentPath}`
      );
    });

    it('should fail when permissions JSON is invalid', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'permissions':
            return 'invalid-json'; // Invalid JSON
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        expect.stringContaining('Failed to parse permissions JSON:')
      );
    });

    it('should fail when invalid account type is provided', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'accountType':
            return 'invalid-account-type'; // Invalid account type
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Invalid account type invalid-account-type. Must be one of: org, user, enterprise'
      );
    });

    it('should fail when permissions is not an object', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'permissions':
            return '"just-a-string"'; // Valid JSON but not an object
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        expect.stringContaining('Permissions must be an object')
      );
    });

    it('should fail when permissions is null', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'permissions':
            return 'null'; // Valid JSON but null
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        expect.stringContaining('Permissions must be an object')
      );
    });

    it('should skip account type validation when repositories list is provided', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'accountType':
            return 'invalid-account-type'; // Invalid, but should be ignored
          case 'repositories':
            return 'repo1, repo2'; // When repositories are provided, accountType is ignored
          default:
            return '';
        }
      });

      await run();

      // Should succeed because accountType validation is skipped when repositories are provided
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });
  });

  describe('enterprise validation scenarios', () => {
    it('should succeed with enterprise account type when owner is provided', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'my-enterprise';
          case 'accountType':
            return 'enterprise';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      await run();

      // Should succeed with enterprise account type
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', 'mock-pem-key');
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'my-enterprise', 'enterprise', []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);
      
      // Verify output variables are set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should fail when enterprise account type is used without owner', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return ''; // Empty owner
          case 'accountType':
            return 'enterprise';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      // Use non-GitHub provider to avoid owner auto-extraction
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'TfsGit';
          case 'Build.Repository.Name':
            return 'project/repo';
          default:
            return undefined;
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Enterprise account type requires an owner to be specified.'
      );
    });

    it('should fail when enterprise account type is used with repositories', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'my-enterprise';
          case 'accountType':
            return 'enterprise';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'repositories':
            return 'repo1'; // Enterprise doesn't support repository scoping
          default:
            return '';
        }
      });

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Enterprise account type does not support repository scoping. Remove the repositories input.'
      );
    });

    it('should fail when forceRepoScope is used with enterprise account type', async () => {
      // Mock service connection that has forceRepoScope enabled
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'MyGitHubAppConnection';
          case 'accountType':
            return 'enterprise';
          case 'owner':
            return 'my-enterprise';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        scheme: 'Certificate',
        parameters: {
          certificate: 'mock-pem-key',
          appClientId: 'test-app-id',
          url: 'https://api.github.com',
          forceRepoScope: 'true' // This should cause failure with enterprise
        }
      } as any);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Enterprise account type cannot use forceRepoScope. Please set forceRepoScope to false in the service connection.'
      );
    });

    it('should accept enterprise account type in validation', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'my-enterprise';
          case 'accountType':
            return 'enterprise'; // Should be accepted by validation
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      await run();

      // Should succeed and call GitHub service with enterprise account type
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', 'mock-pem-key');
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'my-enterprise', 'enterprise', []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, [], undefined);
      
      // Verify output variables are set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });

    it('should handle enterprise account type with permissions', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'my-enterprise';
          case 'accountType':
            return 'enterprise';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'permissions':
            return '{"contents":"read","issues":"write"}';
          default:
            return '';
        }
      });

      await run();

      // Should succeed and pass permissions to getInstallationToken
      expect(mockGitHubService.generateJWT).toHaveBeenCalledWith('test-app-id', 'mock-pem-key');
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'my-enterprise', 'enterprise', []);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith(
        'mock.jwt.token',
        12345,
        [],
        { contents: 'read', issues: 'write' }
      );
      
      // Verify output variables are set
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATIONID_OUTPUT_VARNAME, '12345', false);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setVariable).toHaveBeenCalledWith(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, '2024-01-01T13:00:00Z', false);
      
      // Verify task variables are set for post-job cleanup
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, 'ghs_mock_installation_token', true);
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.SKIP_TOKEN_TASK_VARNAME, 'false');
      expect(mockedTl.setTaskVariable).toHaveBeenCalledWith(constants.BASE_URL_TASK_VARNAME, constants.DEFAULT_API_URL);
      
      // Should not fail the task
      expect(mockedTl.setResult).not.toHaveBeenCalled();
    });
  });

  describe('service connection features', () => {
    it('should handle permissions override from service connection', async () => {
      const serviceConnectionPermissions = { contents: 'read', metadata: 'read' };
      
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          case 'permissions':
            return '{"issues":"write"}'; // Should be overridden
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'limitPermissions': JSON.stringify(serviceConnectionPermissions)
        }
      } as any);

      await run();

      // Should use service connection permissions, not task input
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith(
        'mock.jwt.token', 
        12345, 
        [], 
        serviceConnectionPermissions
      );
    });

    it('should handle forceRepoScope from service connection', async () => {
      mockedTl.getVariable.mockImplementation((name: string) => {
      switch (name) {
        case 'Build.Repository.Provider':
        return 'GitHub';
        case 'Build.Repository.Name':
        return 'force-owner/force-repo';
        default:
        return undefined;
      }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
      switch (name) {
        case 'githubAppConnection':
        return 'test-connection';
        case 'owner':
        return 'different-owner'; // Should be overridden
        case 'repositories':
        return 'different-repo'; // Should be overridden
        default:
        return '';
      }
      });

      // Spy on tl.debug to check for the ignore message
      const debugSpy = jest.spyOn(tl, 'warning').mockImplementation();

      mockedTl.getEndpointAuthorization.mockReturnValue({
      parameters: {
        'certificate': 'mock-pem-key',
        'appClientId': 'test-app-id',
        'forceRepoScope': 'true'
      }
      } as any);

      await run();

      // Should use forced owner and repo from Build.Repository.Name
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'force-owner', "org", ['force-repo']);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, ['force-repo'], undefined);

      // Assert that a debug message was logged about ignoring the passed repo
      expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Forcing repo scope to force-repo. Ignoring repositories input different-repo')
      );
    });

    it('should handle custom base URL from service connection', async () => {
      const customBaseUrl = 'https://github.enterprise.com/api/v3';
      
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'url': customBaseUrl
        }
      } as any);

      await run();

      expect(MockedGitHubService).toHaveBeenCalledWith(customBaseUrl, { proxy: mockProxyConfig });
    });

    it('should fail when forceRepoScope is used with non-GitHub provider', async () => {
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'TfsGit'; // Not GitHub
          case 'Build.Repository.Name':
            return 'owner/repo';
          default:
            return undefined;
        }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'forceRepoScope': 'true'
        }
      } as any);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Forcing repo scope is only supported for GitHub repositories. Repo provider is TfsGit'
      );
    });

    it('should handle forceRepoScope with different repositories warning', async () => {
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'GitHub';
          case 'Build.Repository.Name':
            return 'force-owner/force-repo';
          default:
            return undefined;
        }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'force-owner';
          case 'repositories':
            return 'different-repo'; // Different from forced repo - should trigger warning
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'forceRepoScope': 'true'
        }
      } as any);

      await run();

      // Should warn about ignoring the repositories input
      expect(mockedTl.warning).toHaveBeenCalledWith('Forcing repo scope to force-repo. Ignoring repositories input different-repo');
      
      // Should use forced repo from Build.Repository.Name, not the input
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'force-owner', "org", ['force-repo']);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, ['force-repo'], undefined);
    });

    it('should handle forceRepoScope with no repositories warning', async () => {
      mockedTl.getVariable.mockImplementation((name: string) => {
        switch (name) {
          case 'Build.Repository.Provider':
            return 'GitHub';
          case 'Build.Repository.Name':
            return 'force-owner/force-repo';
          default:
            return undefined;
        }
      });

      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'force-owner';
          case 'repositories':
            return ''; // No repositories provided - should trigger different warning
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'forceRepoScope': 'true'
        }
      } as any);

      await run();

      // Should warn about forcing repo scope even though no repositories were provided
      expect(mockedTl.warning).toHaveBeenCalledWith('Forcing repo scope to force-repo, even though no repositories were provided');
      
      // Should use forced repo
      expect(mockGitHubService.getInstallationId).toHaveBeenCalledWith('mock.jwt.token', 'test-app-id', 'force-owner', "org", ['force-repo']);
      expect(mockGitHubService.getInstallationToken).toHaveBeenCalledWith('mock.jwt.token', 12345, ['force-repo'], undefined);
    });
  });

  describe('error handling during execution', () => {
    it('should handle JWT generation failure', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      const jwtError = new Error('Invalid private key format');
      mockGitHubService.generateJWT.mockRejectedValue(jwtError);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Invalid private key format');
    });

    it('should handle installation ID retrieval failure', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      const installationError = new Error('GitHub App not found for Organization test-org');
      mockGitHubService.getInstallationId.mockRejectedValue(installationError);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'GitHub App not found for Organization test-org');
    });

    it('should handle installation token creation failure', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          default:
            return '';
        }
      });

      const tokenError = new Error('Invalid permissions specified');
      mockGitHubService.getInstallationToken.mockRejectedValue(tokenError);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Invalid permissions specified');
    });

    it('should handle service connection not found', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'nonexistent-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue(undefined);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(tl.TaskResult.Failed, 'Service connection nonexistent-connection not found');
    });

    it('should handle invalid service connection permissions JSON', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'limitPermissions': 'invalid-json'
        }
      } as any);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        expect.stringContaining('Failed to parse service connection permissions JSON:')
      );
    });

    it('should handle invalid repository names during installation ID retrieval', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'owner':
            return 'test-org';
          case 'appClientId':
            return 'test-app-id';
          case 'certificate':
            return 'mock-pem-key';
          case 'repositories':
            return 'invalid repo name'; // Invalid repository name with spaces
          default:
            return '';
        }
      });

      // Mock GitHubService to throw validation error like the real implementation
      const repoValidationError = new Error('Invalid repository name format: invalid repo name. It can only contain ASCII letters, digits, and the characters ., -, and _');
      mockGitHubService.getInstallationId.mockRejectedValue(repoValidationError);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        'Invalid repository name format: invalid repo name. It can only contain ASCII letters, digits, and the characters ., -, and _'
      );
    });

    it('should handle service connection with invalid permissions object type', async () => {
      mockedTl.getInput.mockImplementation((name: string) => {
        switch (name) {
          case 'githubAppConnection':
            return 'test-connection';
          case 'owner':
            return 'test-org';
          default:
            return '';
        }
      });

      mockedTl.getEndpointAuthorization.mockReturnValue({
        parameters: {
          'certificate': 'mock-pem-key',
          'appClientId': 'test-app-id',
          'limitPermissions': '"not-an-object"' // Valid JSON but not an object
        }
      } as any);

      await run();

      expect(mockedTl.setResult).toHaveBeenCalledWith(
        tl.TaskResult.Failed,
        expect.stringContaining('Service connection permissions must be an object')
      );
    });
  });  
});
