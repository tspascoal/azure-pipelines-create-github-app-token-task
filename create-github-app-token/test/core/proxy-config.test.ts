import { ProxyConfig, ProxyOptions } from '../../src/core/proxy-config';
import * as tl from 'azure-pipelines-task-lib/task';

// Mock azure-pipelines-task-lib
jest.mock('azure-pipelines-task-lib/task');
const mockedTl = tl as jest.Mocked<typeof tl>;

describe('ProxyConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create ProxyConfig with empty options', () => {
      const proxyConfig = new ProxyConfig();
      expect(proxyConfig.hasProxyConfiguration()).toBe(false);
    });

    it('should create ProxyConfig with proxy URL only', () => {
      const options: ProxyOptions = {
        proxyUrl: 'http://proxy.example.com:8080'
      };
      const proxyConfig = new ProxyConfig(options);
      expect(proxyConfig.hasProxyConfiguration()).toBe(true);
    });

    it('should create ProxyConfig with all options', () => {
      const options: ProxyOptions = {
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      };
      const proxyConfig = new ProxyConfig(options);
      expect(proxyConfig.hasProxyConfiguration()).toBe(true);
    });
  });

  describe('fromAzurePipelines', () => {
    it('should return undefined when no proxy configuration exists', () => {
      mockedTl.getHttpProxyConfiguration.mockReturnValue(null);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = ProxyConfig.fromAzurePipelines('https://api.github.com');

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith('No proxy configuration found');
      consoleSpy.mockRestore();
    });

    it('should create ProxyConfig from Azure Pipelines configuration', () => {
      const mockProxyConfig = {
        proxyUrl: 'http://proxy.company.com:8080',
        proxyUsername: 'testuser',
        proxyPassword: 'testpass',
        proxyFormattedUrl: 'http://testuser:testpass@proxy.company.com:8080'
      };
      mockedTl.getHttpProxyConfiguration.mockReturnValue(mockProxyConfig);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = ProxyConfig.fromAzurePipelines('https://api.github.com');

      expect(result).toBeInstanceOf(ProxyConfig);
      expect(result!.hasProxyConfiguration()).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Proxy configuration: proxyUrl=http://proxy.company.com:8080, proxyUsername=provided'
      );
      consoleSpy.mockRestore();
    });

    it('should create ProxyConfig without username', () => {
      const mockProxyConfig = {
        proxyUrl: 'http://proxy.company.com:8080',
        proxyUsername: undefined,
        proxyPassword: undefined,
        proxyFormattedUrl: 'http://proxy.company.com:8080'
      };
      mockedTl.getHttpProxyConfiguration.mockReturnValue(mockProxyConfig);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = ProxyConfig.fromAzurePipelines('https://api.github.com');

      expect(result).toBeInstanceOf(ProxyConfig);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Proxy configuration: proxyUrl=http://proxy.company.com:8080, proxyUsername=not provided'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('hasProxyConfiguration', () => {
    it('should return false when no proxy URL is set', () => {
      const proxyConfig = new ProxyConfig();
      expect(proxyConfig.hasProxyConfiguration()).toBe(false);
    });

    it('should return true when proxy URL is set', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com:8080' });
      expect(proxyConfig.hasProxyConfiguration()).toBe(true);
    });
  });

  describe('getProxyAgent', () => {
    it('should return undefined when no proxy URL is configured', () => {
      const proxyConfig = new ProxyConfig();
      const agent = proxyConfig.getProxyAgent();
      expect(agent).toBeUndefined();
    });

    it('should return HTTP proxy agent for HTTP proxy URL', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com:8080' });
      const agent = proxyConfig.getProxyAgent();
      expect(agent).toBeDefined();
      expect(agent!.constructor.name).toBe('HttpProxyAgent');
    });

    it('should return HTTPS proxy agent for HTTPS proxy URL', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'https://proxy.example.com:8080' });
      const agent = proxyConfig.getProxyAgent();
      expect(agent).toBeDefined();
      expect(agent!.constructor.name).toBe('HttpsProxyAgent');
    });

    it('should configure proxy agent with authentication', () => {
      const proxyConfig = new ProxyConfig({ 
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      const agent = proxyConfig.getProxyAgent();
      expect(agent).toBeDefined();
      // Note: We can't easily test the internal configuration without exposing internals
    });
  });
});
