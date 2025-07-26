import { GitHubService } from '../../src/core/github-service';
import { ProxyConfig } from '../../src/core/proxy-config';
import * as tl from 'azure-pipelines-task-lib/task';
import * as jwt from 'jsonwebtoken';
import nock from 'nock';

// Mock azure-pipelines-task-lib
jest.mock('azure-pipelines-task-lib/task');
const mockedTl = tl as jest.Mocked<typeof tl>;

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('GitHubService', () => {
  const baseUrl = 'https://api.github.com';
  const mockPrivateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA4qiXIlbjuR+nWrTr2iq/4FLJKnU3kZqGLiVHr5BYTdZ1YeYE
mockprivatekeydata
-----END RSA PRIVATE KEY-----`;
  const mockJwtToken = 'mock.jwt.token';

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    
    // Mock console.log and console.error to suppress output during tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Mock tl.debug
    mockedTl.debug.mockImplementation();

    // Default JWT mock - jwt.sign returns a string when called synchronously with options
    (jwt.sign as jest.Mock).mockReturnValue(mockJwtToken);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create GitHubService with base URL', () => {
      const service = new GitHubService(baseUrl);
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should throw error when base URL is not provided', () => {
      expect(() => new GitHubService('')).toThrow('GitHub API base URL is required');
    });

    it('should normalize base URL by removing trailing slash', () => {
      const service = new GitHubService('https://api.github.com/');
      expect(service).toBeInstanceOf(GitHubService);
    });

    it('should create service with proxy configuration', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com:8080' });
      const service = new GitHubService(baseUrl, { proxy: proxyConfig });
      expect(service).toBeInstanceOf(GitHubService);
    });
  });

  describe('generateJWT', () => {
    it('should generate JWT with correct payload', async () => {
      const appId = 'test-app-id';
      const mockDate = new Date('2024-01-01T12:00:00.000Z');
      const expectedTimestamp = Math.floor(mockDate.getTime() / 1000);
      
      jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());
      
      await new GitHubService(baseUrl).generateJWT(appId, mockPrivateKey);

      expect(jwt.sign).toHaveBeenCalledWith(
        {
          iat: expectedTimestamp - 60,
          exp: expectedTimestamp + 600 - 60, // 10 minutes (minus 60 seconds for clock skew)
          iss: appId
        },
        mockPrivateKey,
        { algorithm: 'RS256' }
      );
    });
  });

  describe('getInstallationId', () => {
    const owner = 'test-org';
    const user = 'mona-lisa';
    const installationId = 12345;
    const mockInstallationResponse = {
      id: installationId,
      repository_selection: 'all',
      permissions: {
        contents: 'read',
        issues: 'write'
      },
      app_slug: 'test-app',
      target_type: 'Organization'
    };

    describe('organization installation', () => {
      it('should get installation ID for organization', async () => {
        nock(baseUrl)
          .get(`/orgs/${owner}/installation`)
          .reply(200, mockInstallationResponse);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', owner, 'org');

        expect(result).toBe(installationId);
      });

      it('should handle 404 error for organization installation', async () => {
        nock(baseUrl)
          .get(`/orgs/${owner}/installation`)
          .reply(404, { message: 'Not Found' });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', owner, 'org')
        ).rejects.toThrow(`GitHub App not found for Organization ${owner}. Please verify the installation.`);
      });
    });

    describe('user installation', () => {
      it('should get installation ID for user', async () => {
        nock(baseUrl)
          .get(`/users/${user}/installation`)
          .reply(200, mockInstallationResponse);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', user, 'user');

        expect(result).toBe(installationId);
      });

      it('should handle 404 error for user installation', async () => {
        nock(baseUrl)
          .get(`/users/${owner}/installation`)
          .reply(404, { message: 'Not Found' });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', owner, 'user')
        ).rejects.toThrow(`GitHub App not found for account ${owner}. Please verify the installation.`);
      });
    });

    describe('repository installation', () => {
      const repo = 'test-repo';

      it('should get installation ID for repository', async () => {
        nock(baseUrl)
          .get(`/repos/${owner}/${repo}/installation`)
          .reply(200, mockInstallationResponse);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', owner, "org", [repo]);

        expect(result).toBe(installationId);
      });

      it('should reject invalid repository names', async () => {
        const invalidRepo = 'invalid repo name';
        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', owner, "org", [invalidRepo])
        ).rejects.toThrow(`Invalid repository name format: ${invalidRepo}. It can only contain ASCII letters, digits, and the characters ., -, and _`);
      });

      it('should handle 404 error for repository installation', async () => {
        nock(baseUrl)
          .get(`/repos/${owner}/${repo}/installation`)
          .reply(404, { message: 'Not Found' });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', owner, "org", [repo])
        ).rejects.toThrow(`GitHub App not found for Organization ${owner}. Please verify the installation and repository access.`);
      });
    });

    it('should handle generic errors', async () => {
      nock(baseUrl)
        .get(`/orgs/${owner}/installation`)
        .reply(500, { message: 'Internal Server Error' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationId(mockJwtToken, 'test-app-id', owner, "org")
      ).rejects.toThrow('Failed to get installation ID:');
    });

    describe('enterprise installation', () => {
      const enterprise = 'my-enterprise';
      const installationId = 54321;
      const mockEnterpriseInstallation = {
        id: installationId,
        target_type: 'Enterprise',
        account: {
          login: enterprise
        },
        app_id: 2345,
        client_id: 'test-app-id',
        app_slug: 'test-app',
        permissions: {
            enterprise_custom_properties: "read"
        },
      };

      it('should get installation ID for enterprise by app client id', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, [
            {
              id: 11111,
              target_type: 'Organization',
              account: { login: 'some-org' }
            },
            mockEnterpriseInstallation,
            {
              id: 22222,
              target_type: 'User',
              account: { login: 'some-user' }
            }
          ]);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise');

        expect(result).toBe(installationId);
      });

      it('should get installation ID for enterprise by app id', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, [
            {
              id: 11111,
              target_type: 'Organization',
              account: { login: 'some-org' }
            },
            mockEnterpriseInstallation,
            {
              id: 22222,
              target_type: 'User',
              account: { login: 'some-user' }
            }
          ]);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, '2345', enterprise, 'enterprise');

        expect(result).toBe(installationId);
      });

      it('should handle multiple pages when searching for enterprise', async () => {
        // First page with no enterprise installations
        const page1Scope = nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, Array(100).fill({
              id: 11111,
              target_type: 'Organization',
              account: { login: 'some-org' }
            }), {
              'link': '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"'
            }
        );

        // Second page with enterprise installation
        const page2Scope = nock(baseUrl)
          .get('/app/installations?per_page=100&page=2')
          .reply(
            200,
            [
              mockEnterpriseInstallation,
              {
                id: 22222,
                target_type: 'User',
                account: { login: 'some-user' }
              }
            ],
            {
              'link': '<https://api.github.com/app/installations?per_page=100&page=2>; rel="last"'
            }
          );

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise');

        expect(result).toBe(installationId);
        expect(page1Scope.isDone()).toBe(true);
        expect(page2Scope.isDone()).toBe(true);
      });

      it('should throw error when no enterprise installations found', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, [
            {
              id: 11111,
              target_type: 'Organization',
              account: { login: 'some-org' }
            },
            {
              id: 22222,
              target_type: 'User',
              account: { login: 'some-user' }
            }
          ]);

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise')
        ).rejects.toThrow(`GitHub App installation not found for app ID/client ID 'test-app-id'. Please verify the app ID/client ID and enterprise installation.`);
      });

      it('should throw error when specific enterprise not found', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, [
            {
              id: 33333,
              target_type: 'Enterprise',
              account: { login: 'other-enterprise' },
              app_id: 'different-app-id',
              client_id: 'different-client-id'
            }
          ]);

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise')
        ).rejects.toThrow(`GitHub App installation not found for app ID/client ID 'test-app-id'. Please verify the app ID/client ID and enterprise installation.`);
      });

      it('should handle rate limiting during pagination', async () => {
        // First request hits low rate limit but still works
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, Array(100).fill({
            id: 11111,
            target_type: 'Organization',
            account: { login: 'some-org' }
          }), {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120), // Reset in 2 minutes (within 5 min threshold)
            'link': '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"'
          });

        // Second request should succeed after waiting
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=2')
          .reply(200, [mockEnterpriseInstallation]);

        const service = new GitHubService(baseUrl);
        
        // Mock setTimeout to avoid actually waiting
        const originalSetTimeout = global.setTimeout;
        const mockSetTimeout = jest.fn((callback: Function) => {
          callback();
          return {} as any;
        }) as any;
        global.setTimeout = mockSetTimeout;

        try {
          const result = await service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise');
          expect(result).toBe(installationId);
          expect(mockSetTimeout).toHaveBeenCalled();
        } finally {
          global.setTimeout = originalSetTimeout;
        }
      }, 15000); // Increased timeout

      it('should throw error when rate limit exceeded', async () => {
        // First page has some installations but hits rate limit
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, Array(100).fill({
            id: 11111,
            target_type: 'Organization',
            account: { login: 'some-org' }
          }), {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600), // Reset in 1 hour
            'link': '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"'
          });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getEnterpriseInstallationId(mockJwtToken, 'test-app-id')
        ).rejects.toThrow('GitHub API rate limit exceeded');
      });

      it('should handle 401 authentication error', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(401, { message: 'Unauthorized' });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise')
        ).rejects.toThrow('GitHub App JWT authentication failed. Please verify the app credentials.');
      });

      it('should handle 403 permission error', async () => {
        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(403, { message: 'Forbidden' });

        const service = new GitHubService(baseUrl);
        
        await expect(
          service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise')
        ).rejects.toThrow('GitHub App does not have permission to list installations. Please verify the app permissions.');
      });

      it('should handle multiple enterprise installations with warning', async () => {
        const mockInstallations = [
          {
            id: 55555,
            target_type: 'Enterprise',
            account: { login: enterprise },
            app_id: 'test-app-id',
            client_id: 'test-app-id',
            permissions: { contents: 'read' }
          },
          {
            id: 66666,
            target_type: 'Enterprise',
            account: { login: enterprise }, // Same enterprise, multiple installations
            app_id: 'other-app-id',
            client_id: 'other-app-id',
            permissions: { contents: 'write' }
          }
        ];

        nock(baseUrl)
          .get('/app/installations?per_page=100&page=1')
          .reply(200, mockInstallations);

        const service = new GitHubService(baseUrl);
        const result = await service.getInstallationId(mockJwtToken, 'test-app-id', enterprise, 'enterprise');

        // Should return the first matching installation
        expect(result).toBe(55555);
      });
    });
  });

  describe('getInstallationToken', () => {
    const installationId = 12345;
    const mockTokenResponse = {
      token: 'ghs_mock_installation_token',
      expires_at: '2024-01-01T13:00:00Z',
      repository_selection: 'selected',
      permissions: {
        contents: 'read',
        issues: 'write'
      }
    };

    it('should create installation token without repositories', async () => {
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {})
        .reply(200, mockTokenResponse);

      const service = new GitHubService(baseUrl);
      const result = await service.getInstallationToken(mockJwtToken, installationId);

      expect(result.token).toBe(mockTokenResponse.token);
      expect(result.expiresAt).toBe(mockTokenResponse.expires_at);
    });

    it('should create installation token with repositories', async () => {
      const repositories = ['repo1', 'repo2'];
      
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, (body) => {
          // Assert that the request body contains the correct repositories array
          expect(body).toHaveProperty('repositories');
          expect(body.repositories).toEqual(repositories);
          return true;
        })
        .reply(200, mockTokenResponse);

      const service = new GitHubService(baseUrl);
      const result = await service.getInstallationToken(mockJwtToken, installationId, repositories);

      expect(result.token).toBe(mockTokenResponse.token);
      expect(result.expiresAt).toBe(mockTokenResponse.expires_at);
    });

    it('should create installation token with permissions', async () => {
      const permissions = { contents: 'read', issues: 'write' };
      
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, { permissions })
        .reply(200, mockTokenResponse);

      const service = new GitHubService(baseUrl);
      const result = await service.getInstallationToken(mockJwtToken, installationId, [], permissions);

      expect(result.token).toBe(mockTokenResponse.token);
      expect(result.expiresAt).toBe(mockTokenResponse.expires_at);
    });

    it('should create installation token with repositories and permissions', async () => {
      const repositories = ['repo1'];
      const permissions = { contents: 'read' };
      
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {
          repositories,
          permissions
        })
        .reply(200, mockTokenResponse);

      const service = new GitHubService(baseUrl);
      const result = await service.getInstallationToken(mockJwtToken, installationId, repositories, permissions);

      expect(result.token).toBe(mockTokenResponse.token);
      expect(result.expiresAt).toBe(mockTokenResponse.expires_at);
    });

    it('should handle 404 error for installation token', async () => {
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {})
        .reply(404, { message: 'Not Found' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId)
      ).rejects.toThrow(`Installation ID ${installationId} not found. Please verify the installation ID is correct.`);
    });

    it('should handle 422 error for invalid permissions', async () => {
      const permissions = { contents: 'admin' }; // Invalid permission level
      
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, { permissions })
        .reply(422, { message: 'Invalid permissions specified' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId, [], permissions)
      ).rejects.toThrow('Invalid request: Invalid permissions specified Please check the permissions. You can only downgrade app permissions.');
    });

    it('should handle 422 error for invalid repositories', async () => {
      const repositories = ['nonexistent-repo'];
      
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, { repositories })
        .reply(422, { message: 'Repository not found' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId, repositories)
      ).rejects.toThrow('Invalid request: Repository not found Please check the repositories. You can only scope the token to the repositories that are already selected or exist.');
    });

    it('should handle generic HTTP errors', async () => {
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {})
        .reply(500, { message: 'Internal Server Error' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId)
      ).rejects.toThrow('Failed to create installation token:');
    });

    it('should handle 403 forbidden error', async () => {
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {})
        .reply(403, { message: 'Forbidden' });

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId)
      ).rejects.toThrow('Failed to create installation token:');
    });

    it('should handle network errors', async () => {
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`)
        .replyWithError('Network error');

      const service = new GitHubService(baseUrl);
      
      await expect(
        service.getInstallationToken(mockJwtToken, installationId)
      ).rejects.toThrow('Failed to create installation token');
    });
  });

  describe('revokeInstallationToken', () => {
    const installationToken = 'ghs_mock_installation_token';

    it('should successfully revoke installation token', async () => {
      nock(baseUrl)
        .delete('/installation/token')
        .reply(204);

      const service = new GitHubService(baseUrl);
      const result = await service.revokeInstallationToken(installationToken);

      expect(result).toBe(true);
    });

    it('should handle errors when revoking token and return false', async () => {
      nock(baseUrl)
        .delete('/installation/token')
        .reply(404, { message: 'Token not found' });

      const service = new GitHubService(baseUrl);

      const result = await service.revokeInstallationToken(installationToken);

      expect(result).toBe(false);
    });

    it('should handle network errors when revoking token', async () => {
      nock(baseUrl)
        .delete('/installation/token')
        .replyWithError('Network error');

      const service = new GitHubService(baseUrl);
      const result = await service.revokeInstallationToken(installationToken);

      expect(result).toBe(false);
    });

    it('should handle revoke token with different HTTP status codes', async () => {
      const service = new GitHubService(baseUrl);
      
      // Test 401 Unauthorized
      nock(baseUrl)
        .delete('/installation/token')
        .reply(401, { message: 'Unauthorized' });

      let result = await service.revokeInstallationToken(installationToken);
      expect(result).toBe(false);

      // Test 500 Internal Server Error  
      nock(baseUrl)
        .delete('/installation/token')
        .reply(500, { message: 'Internal Server Error' });

      result = await service.revokeInstallationToken(installationToken);
      expect(result).toBe(false);
    });
  });

  describe('authorization headers', () => {
    it('should include Bearer token in authorization header', async () => {
      const scope = nock(baseUrl)
        .get('/orgs/test-org/installation')
        .matchHeader('authorization', `Bearer ${mockJwtToken}`)
        .reply(200, { 
          id: 12345,
          repository_selection: 'all',
          permissions: { contents: 'read' }
        });

      const service = new GitHubService(baseUrl);
      await service.getInstallationId(mockJwtToken, 'test-app-id', 'test-org', 'org');

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('advanced integration scenarios', () => {
    it('should handle enterprise GitHub URL normalization', () => {
      const enterpriseUrl = 'https://github.enterprise.com/api/v3/';
      const enterpriseService = new GitHubService(enterpriseUrl);
      expect(enterpriseService).toBeInstanceOf(GitHubService);
    });

    it('should handle multiple repository installations', async () => {
      const owner = 'test-org';
      const repositories = ['repo1', 'repo2', 'repo3'];
      const installationId = 12345;
      const service = new GitHubService(baseUrl);
      
      // Mock the repo installation endpoint
      nock(baseUrl)
        .get(`/repos/${owner}/${repositories[0]}/installation`)
        .reply(200, {
          id: installationId,
          repository_selection: 'selected',
          repositories: repositories.map(name => ({ name })),
          permissions: { contents: 'read' }
        });

      // Mock token creation with multiple repos
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {
          repositories
        })
        .reply(200, {
          token: 'ghs_token_for_multiple_repos',
          expires_at: '2024-01-01T13:00:00Z',
          repository_selection: 'selected',
          permissions: { contents: 'read' }
        });

      const jwtToken = 'mock.jwt.token';
      
      // Get installation ID using first repository
      const actualInstallationId = await service.getInstallationId(
        jwtToken, 
        'test-app-id',
        owner, 
        'org', 
        [repositories[0]]
      );
      
      // Create token for all repositories
      const tokenResult = await service.getInstallationToken(
        jwtToken, 
        actualInstallationId, 
        repositories
      );

      expect(actualInstallationId).toBe(installationId);
      expect(tokenResult.token).toBe('ghs_token_for_multiple_repos');
    });

    it('should handle permission downgrading correctly', async () => {
      const installationId = 12345;
      const jwtToken = 'mock.jwt.token';
      const service = new GitHubService(baseUrl);
      
      // Mock successful permission downgrade
      nock(baseUrl)
        .post(`/app/installations/${installationId}/access_tokens`, {
          permissions: { contents: 'read' } // Downgraded from potential 'write'
        })
        .reply(200, {
          token: 'ghs_downgraded_token',
          expires_at: '2024-01-01T13:00:00Z',
          permissions: { contents: 'read' }
        });

      const result = await service.getInstallationToken(
        jwtToken,
        installationId,
        [],
        { contents: 'read' }
      );

      expect(result.token).toBe('ghs_downgraded_token');
    });

    it('should handle rate limiting headers in debug mode', async () => {
      const owner = 'test-org';
      const service = new GitHubService(baseUrl);
      
      nock(baseUrl)
        .get(`/orgs/${owner}/installation`)
        .reply(200, 
          { 
            id: 12345,
            repository_selection: 'all',
            permissions: { contents: 'read' }
          },
          {
            'x-ratelimit-limit': '5000',
            'x-ratelimit-remaining': '100',
            'x-ratelimit-reset': '1640995200',
            'x-ratelimit-used': '4900'
          }
        );

      const result = await service.getInstallationId('jwt-token', 'test-app-id', owner, "org");
      expect(result).toBe(12345);
      
      // Headers should be logged in debug mode (tested in main GitHubService tests)
    });

    it('should handle installation response without optional fields', async () => {
      const owner = 'test-org';
      const service = new GitHubService(baseUrl);
      
      // Response with minimal required fields
      nock(baseUrl)
        .get(`/orgs/${owner}/installation`)
        .reply(200, { 
          id: 12345,
          repository_selection: 'all',
          permissions: {}
        });

      const result = await service.getInstallationId('jwt-token', 'test-app-id', owner, "org");
      expect(result).toBe(12345);
    });

    it('should handle installation response with selected repositories', async () => {
      const owner = 'test-org';
      const service = new GitHubService(baseUrl);
      
      nock(baseUrl)
        .get(`/orgs/${owner}/installation`)
        .reply(200, { 
          id: 12345,
          repository_selection: 'selected',
          repositories: [
            { name: 'repo1' },
            { name: 'repo2' },
            { name: 'repo3' }
          ],
          permissions: { contents: 'read', issues: 'write' },
          app_slug: 'test-app',
          target_type: 'Organization'
        });

      const result = await service.getInstallationId('jwt-token', 'test-app-id', owner, "org");
      expect(result).toBe(12345);
    });
  });
  
});
