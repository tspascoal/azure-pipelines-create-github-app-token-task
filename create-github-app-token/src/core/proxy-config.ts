import * as tl from 'azure-pipelines-task-lib/task';
import { URL } from 'url';
import * as httpProxy from 'http-proxy-agent';
import * as httpsProxy from 'https-proxy-agent';

export interface ProxyOptions {
    proxyUrl?: string;
    proxyUsername?: string;
    proxyPassword?: string;
}

export class ProxyConfig {
    private proxyUrl?: string;
    private proxyUsername?: string;
    private proxyPassword?: string;

    constructor(options: ProxyOptions = {}) {
        this.proxyUrl = options.proxyUrl;
        this.proxyUsername = options.proxyUsername;
        this.proxyPassword = options.proxyPassword;
    }

    /**
     * Creates a proxy configuration from Azure Pipeline's HttpProxyConfiguration
     * @param baseUrl The base URL that will be used with the proxy
     * @returns A new ProxyConfig instance or undefined if no proxy is configured
     */
    static fromAzurePipelines(baseUrl: string): ProxyConfig | undefined {
        const proxyConfig = tl.getHttpProxyConfiguration(baseUrl);
        if (!proxyConfig) {
            console.log('No proxy configuration found');
            return undefined;
        }

        console.log(`Proxy configuration: proxyUrl=${proxyConfig.proxyUrl}, proxyUsername=${proxyConfig.proxyUsername ? 'provided' : 'not provided'}`);
        return new ProxyConfig({
            proxyUrl: proxyConfig.proxyUrl,
            proxyUsername: proxyConfig.proxyUsername,
            proxyPassword: proxyConfig.proxyPassword
        });
    }

    /**
     * Determines if proxy configuration is available
     */
    hasProxyConfiguration(): boolean {
        return !!this.proxyUrl;
    }

    /**
     * Gets the proxy agent for HTTP/HTTPS requests
     */
    getProxyAgent() {
        if (!this.proxyUrl) {
            return undefined;
        }

        const proxyOpts: any = new URL(this.proxyUrl);
        
        if (this.proxyUsername && this.proxyPassword) {
            proxyOpts.username = this.proxyUsername;
            proxyOpts.password = this.proxyPassword;
        }

        return this.proxyUrl.startsWith('https:')
            ? new httpsProxy.HttpsProxyAgent(proxyOpts)
            : new httpProxy.HttpProxyAgent(proxyOpts);
    }

    /**
     * Gets the axios configuration for the proxy
     */
    getAxiosConfig(): any {
        const proxyAgent = this.getProxyAgent();
        if (!proxyAgent) {
            return {};
        }

        return {
            httpAgent: proxyAgent,
            httpsAgent: proxyAgent
        };
    }
}