import * as tl from 'azure-pipelines-task-lib/task';
import { URL } from 'url';
import type { AxiosProxyConfig } from 'axios';

export interface ProxyOptions {
    proxyUrl?: string;
    proxyUsername?: string;
    proxyPassword?: string;
}

export interface AxiosProxyRequestConfig {
    proxy: AxiosProxyConfig | false;
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

        const sanitizedUrl = ProxyConfig.sanitizeUrl(proxyConfig.proxyUrl);
        console.log(`Proxy configuration: proxyUrl=${sanitizedUrl}, proxyUsername=${proxyConfig.proxyUsername ? 'provided' : 'not provided'}`);
        return new ProxyConfig({
            proxyUrl: proxyConfig.proxyUrl,
            proxyUsername: proxyConfig.proxyUsername,
            proxyPassword: proxyConfig.proxyPassword
        });
    }

    /**
     * Strips userinfo (username:password) from a URL for safe logging.
     */
    static sanitizeUrl(url: string): string {
        try {
            const parsed = new URL(url);
            parsed.username = '';
            parsed.password = '';
            return parsed.toString().replace(/\/$/, '');
        } catch {
            // Fallback: best-effort redaction of potential userinfo while preserving
            // the original (sanitized) string to aid in diagnosing misconfigurations.
            return ProxyConfig.redactUserInfo(url);
        }
    }

    /**
     * Best-effort redaction for strings that look like URLs but cannot be parsed.
     * Removes any "userinfo" component (e.g. "user:pass@") if present.
     */
    private static redactUserInfo(url: string): string {
        const trimmed = url.trim();

        // Match and redact userinfo of the form "scheme://userinfo@host..."
        // Example: "http://user:pass@proxy.example.com:8080" =>
        //          "http://<redacted>@proxy.example.com:8080"
        const userInfoPattern = /^([^:/?#]+:\/\/)([^@]+)@(.+)$/;
        const match = trimmed.match(userInfoPattern);
        if (match) {
            return `${match[1]}<redacted>@${match[3]}`;
        }

        // If no userinfo is detected, return the trimmed input as-is so the user
        // can still see what was provided.
        return trimmed;
    }

    /**
     * Determines if proxy configuration is available
     */
    hasProxyConfiguration(): boolean {
        return !!this.proxyUrl;
    }

    /**
     * Gets the normalized Axios proxy configuration.
     */
    getAxiosProxyConfig(): AxiosProxyConfig | undefined {
        if (!this.proxyUrl) {
            return undefined;
        }

        let proxyUrl: URL;
        try {
            proxyUrl = new URL(this.proxyUrl);
        } catch {
            throw new Error(`Invalid proxy URL: ${ProxyConfig.sanitizeUrl(this.proxyUrl)}`);
        }
        const proxyConfig: AxiosProxyConfig = {
            host: proxyUrl.hostname,
            port: proxyUrl.port ? parseInt(proxyUrl.port, 10) : proxyUrl.protocol === 'https:' ? 443 : 80,
            protocol: proxyUrl.protocol
        };

        let username: string | undefined;
        let password: string | undefined;
        try {
            username = this.proxyUsername ?? (proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined);
            password = this.proxyPassword ?? (proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined);
        } catch {
            // Malformed percent-encoding in proxy credentials
            throw new Error(`Invalid proxy URL: ${ProxyConfig.sanitizeUrl(this.proxyUrl!)}`);
        }

        if (username !== undefined || password !== undefined) {
            proxyConfig.auth = {
                username: username ?? '',
                password: password ?? ''
            };
        }

        return proxyConfig;
    }

    /**
     * Gets the axios configuration for the proxy
     */
    getAxiosConfig(): AxiosProxyRequestConfig {
        const proxyConfig = this.getAxiosProxyConfig();
        if (!proxyConfig) {
            return { proxy: false };
        }

        return {
            proxy: proxyConfig
        };
    }
}
