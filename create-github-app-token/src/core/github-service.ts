import * as tl from 'azure-pipelines-task-lib/task';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';
import { ProxyConfig, ProxyOptions } from './proxy-config';
import { validateRepositoryName } from '../utils/validation';
import * as constants from '../utils/constants';

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
                'Accept': 'application/vnd.github.v3+json'
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
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iat: now - 60,        // issued at time, 60s in the past to allow for clock drift
            exp: now + constants.JWT_EXPIRATION,
            iss: appIdOrClientId  // GitHub App's client (preferable) or app identifier
        };

        return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
    }

    /**
     * Retrieves the installation ID for a GitHub App based on the provided parameters.
     *
     * @param jwtToken - The JSON Web Token (JWT) used for authentication with the GitHub API.
     * @param owner - The owner of the repository or organization (username or organization name).
     * @param isOrg - A boolean indicating whether the owner is an organization (not relevant if repo is being passed).
     * @param repositories - An optional array of repository names to narrow down the installation ID retrieval.
     *                        If provided, the first repository in the array will be used to get the installation token.
     * @returns A promise that resolves to the installation ID of the GitHub App.
     * @throws An error if the repository name is invalid or if the API request fails.
     */
    async getInstallationId(jwtToken: string, owner: string, isOrg: boolean, repositories: string[] = []): Promise<number> {
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
            } else if (isOrg) {
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
                console.log(`Repositories count: ${response.data.repositories}`);
                const reposCSV = response.data.repositories.select((r: any) => r.name).join(', ');
                tl.debug(`Repositories: ${reposCSV}`);
            }
            const permissionsCsv = this.formatPermissions(response.data.permissions);
            console.log(`Permissions: ${permissionsCsv}`);

            tl.debug(`App slug: ${response.data.app_slug}`);
            tl.debug(`Target type: ${response.data.target_type}`);

        } finally {
            console.log('##[endgroup]')
        }

        return id;
    }

    /**
     * Generates an installation token for a GitHub App installation.
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
    async getInstallationToken(jwtToken: string, installationId: number, repositories: string[] = [], permissions?: { [key: string]: string }): Promise<string> {
        let groupName = '';
        let token = '';
        if (repositories.length > 0) {
            groupName = `##[group]Create installation token for repositories: ${repositories} with ${installationId}`;
        } else {
            groupName = `##[group]Create installation token for owner with ${installationId}`;
        }

        console.log(`##[group]${groupName}`);

        try {

            const requestBody: any = {};
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

            this.dumpHeaders(response.headers);

            tl.debug(`Expires: ${response.data.expires_at}`);
            console.log(`Repository selection: ${response.data.repository_selection}`);
            const permissionsCsv = this.formatPermissions(response.data.permissions);
            console.log(`Permissions: ${permissionsCsv}`);

        } finally {
            console.log('##[endgroup]')
        }

        return token;
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
    private dumpHeaders(headers: any) {
        Object.keys(headers).forEach((key) => {
            const value = headers[key];
            tl.debug(`Header: ${key} = ${value}`);
        });
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