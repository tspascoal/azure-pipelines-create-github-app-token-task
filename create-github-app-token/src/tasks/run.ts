import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import { GitHubService } from '../core/github-service';
import { ProxyConfig } from '../core/proxy-config';
import * as constants from '../utils/constants';
import { getRepoName, getOwnerName } from '../utils/github';
import { validateAccountType } from '../utils/validation';

async function run() {
  try {
    let baseUrl = constants.DEFAULT_API_URL;

    const provider = tl.getVariable('Build.Repository.Provider');
    let owner = tl.getInput('owner', false)
    const nwo = tl.getVariable('Build.Repository.Name')!;

    // If owner is not provided,get it from the repository name (provider has to be GitHub)
    if (!owner) {
      failIfProviderIsNotGitHub(provider, "If owner is not provided, the repository provider must be GitHub");
      const extractedOwner = getOwnerName(nwo);
      console.log(`Extracted owner from Build.Repository.Name: ${extractedOwner}`);

      owner = extractedOwner;
    }

    const accountType = tl.getInput('accountType', false) || constants.ACCOUNT_TYPE_ORG;
    let appClientId = tl.getInput('appClientId', false) || undefined;
    const privateKeyPath = tl.getInput('certificateFile', false) || '';
    const privateKeyInput = tl.getInput('certificate', false) || '';
    let repositoriesList = tl.getInput('repositories', false)?.trim() || undefined;
    const connectedServiceName = tl.getInput('githubAppConnection', false);
    const skipTokenRevoke = tl.getBoolInput('skipTokenRevoke', false);
    const permissionsInput = tl.getInput('permissions', false);

    let permissions: { [key: string]: string } | undefined = undefined;
    if (permissionsInput) {
      try {
        permissions = JSON.parse(permissionsInput);
        if (typeof permissions !== 'object' || permissions === null) {
          throw new Error('Permissions must be an object');
        }
      } catch (err: any) {
        throw new Error(`Failed to parse permissions JSON: ${err.message}`);
      }
    }

    let privateKey = '';

    console.log('##[group]Inputs')
    console.log(`App client ID: ${appClientId}`);
    console.log(`Connected Service Name: ${connectedServiceName}`);
    console.log(`Private Key Input: ${privateKeyInput.length > 0 ? 'Provided' : 'Not Provided'}`);
    console.log(`Private Key Path: ${privateKeyPath}`);
    console.log(`Owner: ${owner}`);
    console.log(`Account Type: ${accountType}`);
    console.log(`Repositories List: ${repositoriesList ? repositoriesList : 'Not Provided'}`);
    console.log(`Permissions: ${permissions ? JSON.stringify(permissions) : 'Not Provided'}`);
    console.log(`Skip Token Revoke: ${skipTokenRevoke}`);
    if (permissions) {
      console.log(`Permissions: ${JSON.stringify(permissions)}`);
    }
    console.log('##[endgroup]')

    // Order of precedence for private key:
    // 1. Service Connection
    // 2. Certificate input
    // 3. Certificate file path
    if (connectedServiceName) {
      console.log('##[group]Using GitHub App service connection');
      const endpoint = tl.getEndpointAuthorization(connectedServiceName, true);
      if (endpoint) {
        privateKey = endpoint.parameters['certificate'];
        appClientId = endpoint.parameters['appClientId'];
        baseUrl = endpoint.parameters['url'] || baseUrl;

        const limitPermissions = endpoint.parameters['limitPermissions'];
        if (limitPermissions) {
          console.log('Limiting permissions to those defined in the service connection');
          try {
            permissions = JSON.parse(limitPermissions);
            if (typeof permissions !== 'object' || permissions === null) {
              throw new Error('Service connection permissions must be an object');
            }
            console.log('Using permissions from service connection, overriding task input if any');
          } catch (err: any) {
            throw new Error(`Failed to parse service connection permissions JSON: ${err.message}`);
          }
          tl.warning(`Forcing permissions from service connection`);
          console.log(`Forced permissions: ${JSON.stringify(permissions)}`);
        }

        const forceRepoScope = endpoint.parameters['forceRepoScope']?.toLowerCase() === 'true';
        if (forceRepoScope) {
          // Enterprise accounts cannot use forceRepoScope
          if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ENTERPRISE) {
            tl.setResult(tl.TaskResult.Failed, 'Enterprise account type cannot use forceRepoScope. Please set forceRepoScope to false in the service connection.');
            return;
          }

          console.log('Forcing repo scope)');
          console.log(`Repo Provider: ${provider}`);

          failIfProviderIsNotGitHub(provider, `Forcing repo scope is only supported for GitHub repositories. Repo provider is ${provider}`);
          const forcedRepo = getRepoName(nwo);
          console.log(`Forcing repo scope to ${forcedRepo}`);
          if (!repositoriesList) {
            tl.warning(`Forcing repo scope to ${forcedRepo}, even though no repositories were provided`);
          } else if (repositoriesList != forcedRepo) {
            tl.warning(`Forcing repo scope to ${forcedRepo}. Ignoring repositories input ${repositoriesList}`);
          }

          const forcedOwner = getOwnerName(nwo);
            if (owner?.toLowerCase() !== forcedOwner?.toLowerCase()) {
            tl.warning(`Forcing owner ${forcedOwner} previously ${owner}. This may fail if there is an owner type mismatch`);
            owner = getOwnerName(nwo);
          }
          
          repositoriesList = forcedRepo;
        }

        console.log(`Base URL: ${baseUrl}`);
        console.log(`App ID from service connection: ${appClientId}`);

        console.log('##[endgroup]')

      } else {
        // Unreachable code since it forces a required check, but just in case
        console.log('##[endgroup]');
        tl.setResult(tl.TaskResult.Failed, `Service connection ${connectedServiceName} not found`);

        return;
      }
    }

    if (!privateKey && privateKeyInput) {
      console.log('Using private key from certificate input');
      privateKey = privateKeyInput;
    }

    if (!privateKey && privateKeyPath) {
      console.log('Using private key certificate file');
      if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Private key not found in the path: ${privateKeyPath}`);
      }
      privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    }

    if (!privateKey) {
      tl.setResult(tl.TaskResult.Failed, 'Private key not provided. Please configure either a GitHub App service connection, certificate input, or certificate file path.');
      return
    }

    // If repositories is define we don't really need account type
    if (!repositoriesList) {
      validateAccountType(accountType);
    }

    // Enterprise-specific validation
    if (accountType.toLowerCase() === constants.ACCOUNT_TYPE_ENTERPRISE) {
      // Enterprise accounts require the owner field to be specified
      if (!owner) {
        tl.setResult(tl.TaskResult.Failed, 'Owner is required for enterprise account type. Please specify the enterprise slug/name.');
        return;
      }

      // Enterprise accounts cannot use repository scoping
      if (repositoriesList) {
        tl.setResult(tl.TaskResult.Failed, 'Enterprise account type does not support repository scoping. Remove the repositories input.');
        return;
      }

      console.log(`Using enterprise account: ${owner}`);
    }

    if (!appClientId) {
      tl.setResult(tl.TaskResult.Failed, 'App ID not provided. Please configure either a GitHub App service connection or app ID input.');
      return
    }

    const proxyConfig = ProxyConfig.fromAzurePipelines(baseUrl);
    const githubService = new GitHubService(baseUrl, { proxy: proxyConfig });

    const jwtToken = await githubService.generateJWT(appClientId, privateKey);
    console.log('JWT token generated successfully');

    let repositories: string[] = [];
    if (repositoriesList) {
      repositories = repositoriesList.split(',').map(repo => repo.trim());
    }

    const installationId = await githubService.getInstallationId(jwtToken, owner, accountType, repositories);
    console.log(`Found installation ID: ${installationId}`);

    const { token, expiresAt } = await githubService.getInstallationToken(jwtToken, installationId, repositories, permissions);
    console.log('Installation token generated successfully');

    // Set the output variables
    tl.setVariable(constants.INSTALLATIONID_OUTPUT_VARNAME, installationId.toString(), false);
    tl.setVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, token, true); // secret
    tl.setVariable(constants.TOKEN_EXPIRATION_OUTPUT_VARNAME, expiresAt, false);

    // Save state for post job
    tl.setTaskVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, token, true); // secret
    tl.setTaskVariable(constants.SKIP_TOKEN_TASK_VARNAME, skipTokenRevoke.toString());
    tl.setTaskVariable(constants.BASE_URL_TASK_VARNAME, baseUrl);

  } catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

function failIfProviderIsNotGitHub(provider: string | undefined, message: string = 'Provider is not GitHub') {
  if (provider?.toLowerCase() !== 'github') {
    tl.error(message)
    throw new Error(message);
  }
}

// Only run if this module is executed directly (not imported)
if (require.main === module) {
  run();
}

// Export for testing
export { run };


