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

    it('should sanitize credentials from proxy URL in log output', () => {
      const mockProxyConfig = {
        proxyUrl: 'http://secretuser:secretpass@proxy.company.com:8080',
        proxyUsername: undefined,
        proxyPassword: undefined,
        proxyFormattedUrl: 'http://secretuser:secretpass@proxy.company.com:8080'
      };
      mockedTl.getHttpProxyConfiguration.mockReturnValue(mockProxyConfig);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      ProxyConfig.fromAzurePipelines('https://api.github.com');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Proxy configuration: proxyUrl=http://proxy.company.com:8080, proxyUsername=not provided'
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

  describe('getAxiosProxyConfig', () => {
    it('should return undefined when no proxy URL is configured', () => {
      const proxyConfig = new ProxyConfig();
      const config = proxyConfig.getAxiosProxyConfig();
      expect(config).toBeUndefined();
    });

    it('should return proxy config for HTTP proxy URL', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com:8080' });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config).toEqual({
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http:'
      });
    });

    it('should return proxy config for HTTPS proxy URL', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'https://proxy.example.com:8443' });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config).toEqual({
        host: 'proxy.example.com',
        port: 8443,
        protocol: 'https:'
      });
    });

    it('should configure proxy authentication from explicit credentials', () => {
      const proxyConfig = new ProxyConfig({ 
        proxyUrl: 'http://proxy.example.com:8080',
        proxyUsername: 'user',
        proxyPassword: 'pass'
      });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config).toEqual({
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http:',
        auth: {
          username: 'user',
          password: 'pass'
        }
      });
    });

    it('should use default ports when the proxy URL omits them', () => {
      const httpConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com' }).getAxiosProxyConfig();
      const httpsConfig = new ProxyConfig({ proxyUrl: 'https://proxy.example.com' }).getAxiosProxyConfig();

      expect(httpConfig?.port).toBe(80);
      expect(httpsConfig?.port).toBe(443);
    });

    it('should extract credentials from URL when explicit credentials are not provided', () => {
      const proxyConfig = new ProxyConfig({
        proxyUrl: 'http://urluser:urlpass@proxy.example.com:8080'
      });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config).toEqual({
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http:',
        auth: {
          username: 'urluser',
          password: 'urlpass'
        }
      });
    });

    it('should prefer explicit credentials over URL-embedded credentials', () => {
      const proxyConfig = new ProxyConfig({
        proxyUrl: 'http://urluser:urlpass@proxy.example.com:8080',
        proxyUsername: 'explicituser',
        proxyPassword: 'explicitpass'
      });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config?.auth).toEqual({
        username: 'explicituser',
        password: 'explicitpass'
      });
    });

    it('should decode percent-encoded credentials from URL', () => {
      const proxyConfig = new ProxyConfig({
        proxyUrl: 'http://user%40domain:p%40ss%3Aword@proxy.example.com:8080'
      });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config?.auth).toEqual({
        username: 'user@domain',
        password: 'p@ss:word'
      });
    });

    it('should handle URL with username but no password and no explicit credentials', () => {
      const proxyConfig = new ProxyConfig({
        proxyUrl: 'http://onlyuser@proxy.example.com:8080'
      });
      const config = proxyConfig.getAxiosProxyConfig();

      expect(config).toEqual({
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http:',
        auth: {
          username: 'onlyuser',
          password: ''
        }
      });
    });

    it('should throw an error for a malformed proxy URL', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'not-a-valid-url' });

      expect(() => proxyConfig.getAxiosProxyConfig()).toThrow('Invalid proxy URL');
    });

    it('should throw an error for malformed percent-encoded credentials in URL', () => {
      // %ZZ is not valid percent-encoding
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://user%ZZ:pass@proxy.example.com:8080' });

      expect(() => proxyConfig.getAxiosProxyConfig()).toThrow('Invalid proxy URL');
    });
  });

  describe('sanitizeUrl', () => {
    it('should strip credentials from a valid URL', () => {
      expect(ProxyConfig.sanitizeUrl('http://user:pass@proxy.example.com:8080')).toBe('http://proxy.example.com:8080');
    });

    it('should return the URL unchanged when there are no credentials', () => {
      expect(ProxyConfig.sanitizeUrl('http://proxy.example.com:8080')).toBe('http://proxy.example.com:8080');
    });

    it('should redact userinfo from an unparseable URL containing credentials', () => {
      // IPv6 bracket not closed makes the URL unparseable but still has userinfo
      const result = ProxyConfig.sanitizeUrl('http://user:pass@[1.2.3.4:8080');
      expect(result).toContain('<redacted>@');
      expect(result).not.toContain('user');
      expect(result).not.toContain('pass');
    });

    it('should return the original string when unparseable URL has no userinfo', () => {
      expect(ProxyConfig.sanitizeUrl('not-a-valid-url')).toBe('not-a-valid-url');
    });
  });

  describe('getAxiosConfig', () => {
    it('should return proxy:false when no proxy URL is configured', () => {
      const proxyConfig = new ProxyConfig();

      expect(proxyConfig.getAxiosConfig()).toEqual({ proxy: false });
    });

    it('should return Axios proxy settings when a proxy URL is configured', () => {
      const proxyConfig = new ProxyConfig({ proxyUrl: 'http://proxy.example.com:8080' });

      expect(proxyConfig.getAxiosConfig()).toEqual({
        proxy: {
          host: 'proxy.example.com',
          port: 8080,
          protocol: 'http:'
        }
      });
    });
  });
});
