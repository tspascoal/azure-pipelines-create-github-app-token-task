import * as tl from 'azure-pipelines-task-lib/task';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';
import { ProxyConfig } from './proxy-config';
import { validateRepositoryName } from '../utils/validation';
import * as constants from '../utils/constants';
import { VERSION, USER_AGENT } from '../utils/version';

export interface GitHubServiceOptions {
    proxy?: ProxyConfig;
}

export class GitHubService {
    private client: AxiosInstance;
    private baseUrl: string;

    constructor(baseUrl: string, options: GitHubServiceOptions = {}) {
        if (!baseUrl) {
            throw new Error('GitHub API base URL is required');
        }
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        const axiosOptions: any = {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': `${USER_AGENT}/${VERSION}`
            }
        };

        // Apply proxy configuration if available
        if (options.proxy?.hasProxyConfiguration()) {
            const proxyConfig = options.proxy.getAxiosConfig();
            Object.assign(axiosOptions, proxyConfig);
        }

        this.client = axios.create(axiosOptions);
    }

    async generateJWT(appIdOrClientId: string, privateKey: string): Promise<string> {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const payload = {
            iat: nowSeconds - constants.JWT_CLOCK_DRIFT_SECONDS,        // issued at time, 60s in the past to allow for clock drift
            exp: nowSeconds + constants.JWT_EXPIRATION - constants.JWT_CLOCK_DRIFT_SECONDS, // expiration time, 10 minutes from now
            iss: appIdOrClientId  // GitHub App's client (preferable) or app identifier
        };

        return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    }

    /**
     * Retrieves the installation ID for a GitHub App based on the provided parameters.
     *
     * APIs:
     * 
     * - https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#get-a-user-installation-for-the-authenticated-app
     * - https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#get-an-organization-installation-for-the-authenticated-app
     * - https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#get-a-repository-installation-for-the-authenticated-app
     * - https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#list-installations-for-the-authenticated-app (for enterprise installations)
     * 
     * @param jwtToken - The JSON Web Token (JWT) used for authentication with the GitHub API.
     * @param owner - The owner of the repository, organization, or enterprise (username, organization name, or enterprise slug).
     * @param accountType - The type of account: 'org', 'user', or 'enterprise'.
     * @param repositories - An optional array of repository names to narrow down the installation ID retrieval.
     *                        If provided, the first repository in the array will be used to get the installation token.
     * @returns A promise that resolves to the installation ID of the GitHub App.
     * @throws An error if the repository name is invalid or if the API request fails.
     */
    async getInstallationId(jwtToken: string, appClientId: string, owner: string, accountType: string, repositories: string[] = []): Promise<number> {
        let url = undefined
        let groupName = '';
        let id = 0;

        try {
            if (repositories.length > 0) {
                const repo = repositories[0];
                groupName = `##[group]Get Installation ID for repository ${owner}/${repo}`;
                url = `${this.baseUrl}/repos/${owner}/${repo}/installation`;

                // make sure the repo name is valid to avoid injection attacks
                if (!validateRepositoryName(repo)) {
                    throw new Error(`Invalid repository name format: ${repo}. It can only contain ASCII letters, digits, and the characters ., -, and _`);
                }
            } else if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ENTERPRISE) {
                // Enterprise installations require pagination through all installations
                return await this.getEnterpriseInstallationId(jwtToken, appClientId);
            } else if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ORG) {
                groupName = `##[group]Get Installation ID for organization ${owner}`;
                url = `${this.baseUrl}/orgs/${owner}/installation`;
            } else {
                groupName = `##[group]Get Installation ID for user ${owner}`;
                url = `${this.baseUrl}/users/${owner}/installation`;
            }

            console.log(`##[group]${groupName}`);

            tl.debug(`Installation ID request URL: ${url}`);

            const response = await this.client.get(url, {
                headers: {
                    'Authorization': `Bearer ${jwtToken}`
                }
            });

            id = response.data.id;

            this.dumpHeaders(response.headers);
            tl.debug(`Response payload: ${JSON.stringify(response.data)}`);

            console.log(`Repository selection: ${response.data.repository_selection}`);
            if (response.data.repository_selection === 'selected' && response.data.repositories) {
                console.log(`Repositories count: ${response.data.repositories.length}`);
                const reposCSV = response.data.repositories.map((r: any) => r.name).join(', ');
                tl.debug(`Repositories: ${reposCSV}`);
            }
            const permissionsCsv = this.formatPermissions(response.data.permissions);
            console.log(`Permissions: ${permissionsCsv}`);

            tl.debug(`App slug: ${response.data.app_slug}`);
            tl.debug(`Target type: ${response.data.target_type}`);

        } catch (err: any) {

            this.dumpHeaders(err.response?.headers);

            let message = '';
            if (err.status === 404) {
                let targetType = 'account';
                if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ORG) {
                    targetType = 'Organization';
                } else if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ENTERPRISE) {
                    targetType = 'Enterprise';
                }
                message = `GitHub App not found for ${targetType} ${owner}. Please verify the installation${repositories.length ? ' and repository access' : ''}.`;
            } else {
                message = `Failed to get installation ID: ${err.message}`;
            }
            throw new Error(message);
        } finally {
            console.log('##[endgroup]')
        }
        return id;
    }

    /**
     * Gets the installation ID for an enterprise installation by listing all installations
     * and filtering for enterprise type. Handles pagination automatically.
     * 
     * Note: This is a workaround since there is no direct API to get the installation ID 
     * for enterprise installations (unlike organizations and repositories).
     * 
     * API: https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#list-installations-for-the-authenticated-app
     * 
     * @param jwtToken - The JWT token for authentication
     * @param appIdOrClientId - GitHub App ID or Client ID to match against
     * @returns Promise<number> - The installation ID
     * @throws Error if no matching app installation found for enterprises, or API errors
     */
    async getEnterpriseInstallationId(jwtToken: string, appIdOrClientId: string): Promise<number> {
        const groupName = `##[group]Get Installation ID for enterprise app ${appIdOrClientId}`;
        console.log(`##[group]${groupName}`);
        console.log('Searching for enterprise installation across all app installations (workaround - no direct API available)');

        let page = 1;
        const perPage = 100; // Maximum allowed by GitHub API
        
        try {
            while (true) {
                const url = `${this.baseUrl}/app/installations?per_page=${perPage}&page=${page}`;
                tl.debug(`Installation list request URL: ${url} (page ${page})`);

                const response = await this.client.get(url, {
                    headers: {
                        'Authorization': `Bearer ${jwtToken}`
                    }
                });

                this.dumpHeaders(response.headers);
                tl.debug(`Response payload (page ${page}): ${JSON.stringify(response.data)}`);

                const installations = response.data;
                tl.debug(`Processing page ${page} of installations (${installations.length} installations)`);

                // Find matching installation by app ID or app client ID
                const matchingInstallation = installations.find((installation: any) => 
                    installation.target_type === 'Enterprise' &&
                    ( 
                        installation.app_id?.toString() === appIdOrClientId ||
                        installation.client_id === appIdOrClientId
                    )
                );

                if (matchingInstallation) {
                    console.log(`Found enterprise installation for app ID/client ID '${appIdOrClientId}' on page ${page}`);
                    const installationId = matchingInstallation.id;

                    tl.debug(`Enterprise installation found: ${matchingInstallation.account.name} (install ID: ${installationId})`);
                    tl.debug(`Installation app slug: ${matchingInstallation.app_slug || 'N/A'}`);
                    tl.debug(`Installation app name: ${matchingInstallation.app_name || 'N/A'}`);
                    
                    return installationId;
                }

                // Check if we've reached the end of results using GitHub's pagination headers
                const linkHeader = response.headers['link'];
                if (!linkHeader || !linkHeader.includes('rel="next"')) {
                    console.log(`No 'next' link header found. Reached end of installations (page ${page}).`);
                    break;
                }

                // Check rate limiting and wait if necessary
                const rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
                const rateLimitReset = parseInt(response.headers['x-ratelimit-reset'] || '0');
                const currentTime = Math.floor(Date.now() / 1000);
                
                if (rateLimitRemaining === 0 && (rateLimitReset - currentTime) <= 300) {
                    const waitTime = (rateLimitReset - currentTime) + 10; // Add 10 seconds buffer
                    console.log(`Rate limit approaching. Waiting ${waitTime} seconds before next request.`);
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                } else if (rateLimitRemaining === 0) {
                    const resetTime = new Date(rateLimitReset * 1000).toISOString();
                    throw new Error(`GitHub API rate limit exceeded. Reset time: ${resetTime}. Please try again later.`);
                }

                page++;
            }

            // If we reach here, the enterprise installation was not found
            throw new Error(`GitHub App installation not found for app ID/client ID '${appIdOrClientId}'. Please verify the app ID/client ID and enterprise installation.`);

        } catch (err: any) {
            let message = '';
            if (err.response && err.response.status === 401) {
                message = `GitHub App JWT authentication failed. Please verify the app credentials.`;
            } else if (err.response && err.response.status === 403) {
                message = `GitHub App does not have permission to list installations. Please verify the app permissions.`;
            } else if (err.message.includes('rate limit') || err.message.includes('Rate limit')) {
                throw err; // Re-throw rate limit errors as-is
            } else {
                message = err.message || `Failed to get enterprise installation ID: ${err}`;
            }
            
            if (message !== err.message) {
                throw new Error(message);
            } else {
                throw err;
            }
        } finally {
            console.log('##[endgroup]')
        }
    }

    /**
     * Generates an installation token for a GitHub App installation.
     * 
     * API: https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app
     *
     * @param jwtToken - The JSON Web Token (JWT) used for authenticating the request.
     * @param installationId - The ID of the GitHub App installation for which the token is being created.
     * @param repositories - An optional array of repository names to scope the token to specific repositories.
     *                        If not provided, the token will be scoped to the entire installation.
     * @param permissions - An optional object specifying the permissions to be granted to the token.
     * @returns A promise that resolves to the installation token as a string.
     *
     * @remarks
     * This method sends a POST request to the GitHub API to create an access token for the specified installation.
     * It logs details about the token creation process, including repository selection and permissions.
     * The token is scoped based on the provided repositories or the entire installation if no repositories are specified.
     */
    async getInstallationToken(jwtToken: string, installationId: number, repositories: string[] = [], permissions?: { [key: string]: string }): Promise<{ token: string; expiresAt: string }> {
        let groupName = '';
        let token = '';
        let expiresAt = '';
        if (repositories.length > 0) {
            groupName = `##[group]Create installation token for repositories: ${repositories} with ${installationId}`;
        } else {
            groupName = `##[group]Create installation token for owner with ${installationId}`;
        }

        console.log(`##[group]${groupName}`);

        const requestBody: any = {};
        try {
            if (repositories.length > 0) {
                requestBody.repositories = repositories;
            }
            if (permissions && Object.keys(permissions).length > 0) {
                requestBody.permissions = permissions;
            }

            const response = await this.client.post(
                `${this.baseUrl}/app/installations/${installationId}/access_tokens`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${jwtToken}`
                    }
                }
            );

            token = response.data.token;
            expiresAt = response.data.expires_at;

            this.dumpHeaders(response.headers);

            tl.debug(`Expires: ${expiresAt}`);
            console.log(`Repository selection: ${response.data.repository_selection}`);
            const permissionsCsv = this.formatPermissions(response.data.permissions);
            console.log(`Permissions: ${permissionsCsv}`);

        } catch (err: any) {
            if (err.response) {
                let message
                this.dumpHeaders(err.response.headers);
                if (err.response.status === 404) {
                    message = `Installation ID ${installationId} not found. Please verify the installation ID is correct.`;
                } else if (err.response.status === 422) {
                    const errorMessage = err.response.data.message || 'The provided parameters are invalid';
                    const permissionsMessage = requestBody.permissions ? ' Please check the permissions. You can only downgrade app permissions.' : '';
                    const repositoriesMessage = requestBody.repositories ? ' Please check the repositories. You can only scope the token to the repositories that are already selected or exist.' : '';
                    message = `Invalid request: ${errorMessage}${permissionsMessage}${repositoriesMessage}`;
                } else {
                    message = `Failed to create installation token: ${err.message}`
                }

                throw new Error(message);
            }
            throw new Error("Failed to create installation token");
        } finally {
            console.log('##[endgroup]')
        }

        return { token, expiresAt };
    }

    async revokeInstallationToken(token: string): Promise<boolean> {
        try {
            console.log('Revoking GitHub App installation token');
            const response = await this.client.delete(
                `${this.baseUrl}/installation/token`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            this.dumpHeaders(response.headers);
            return true;
        } catch (err: any) {
            console.log(`Error revoking token: ${err.message}`);
            if (err.response) {
                this.dumpHeaders(err.response.headers);
            }
            return false;
        }
    }

    /**
     * Logs the headers by iterating through each key-value pair and outputting them as debug messages.
     *
     * Only if debug logging is enabled.
     *
     * @param headers - An object containing the headers to be logged, where each key is the header name
     * and the corresponding value is the header value.
     */
    private dumpHeaders(headers: Record<string, any> | undefined | null): void {
        if (!headers || tl.getVariable('System.Debug')?.toLowerCase() !== 'true') return;
        
        for (const [key, value] of Object.entries(headers)) {
            tl.debug(`Header: ${key} = ${value}`);
        }
    }

    private formatPermissions(permissions: any): string {
        const keys = Object.keys(permissions);
        const formattedPermissions = keys.map((key) => {
            const value = permissions[key];
            return `${key}=${value}`;
        }).join(', ');

        return formattedPermissions;
    }
}