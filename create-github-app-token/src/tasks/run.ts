import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'fs';
import { GitHubService } from '../core/github-service';
import { ProxyConfig } from '../core/proxy-config';
import * as constants from '../utils/constants';
import { getRepoName } from '../utils/github'; 
import { validateAccountType } from '../utils/validation';

async function run() {
  try {
    let baseUrl = constants.DEFAULT_API_URL;

    const owner = tl.getInputRequired('owner')!;
    const accountType = tl.getInput('accountType', false) || constants.ACCOUNT_TYPE_ORG;
    let appClientId = tl.getInput('appClientId', false) || undefined;
    const privateKeyPath = tl.getInput('certificateFile', false) || '';
    const privateKeyInput = tl.getInput('certificate', false) || '';
    let repositoriesList = tl.getInput('repositories', false)?.trim() || undefined;
    const connectedServiceName = tl.getInput('githubAppConnection', false);
    const skipTokenRevoke = tl.getBoolInput('skipTokenRevoke', false);

    let privateKey = '';

    console.log('##[group]Inputs')
    console.log(`App client ID: ${appClientId}`);
    console.log(`Connected Service Name: ${connectedServiceName}`);
    console.log(`Private Key Input: ${privateKeyInput.length > 0 ? 'Provided' : 'Not Provided'}`);
    console.log(`Private Key Path: ${privateKeyPath}`);
    console.log(`Owner: ${owner}`);
    console.log(`Account Type: ${accountType}`);
    console.log(`Repositories List: ${repositoriesList ? repositoriesList : 'Not Provided'}`);
    console.log(`Skip Token Revoke: ${skipTokenRevoke}`);
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
        const forceRepoScope = endpoint.parameters['forceRepoScope']?.toLowerCase() === 'true';
        if (forceRepoScope) {
          console.log('Forcing repo scope)');
          const provider = tl.getVariable('Build.Repository.Provider');
          console.log(`Repo Provider: ${provider}`);

            if (provider?.toLowerCase() === 'github') {
            const repo = tl.getVariable('Build.Repository.Name');
            if (repo) {
              const forcedRepo = getRepoName(repo);
              console.log(`Forcing repo scope to ${forcedRepo}`);
              if (!repositoriesList) {
                tl.warning(`Forcing repo scope to ${forcedRepo}, even though no repositories were provided`);
              } else if(repositoriesList != forcedRepo) {
                tl.warning(`Forcing repo scope to ${forcedRepo}. Ignoring repositories input ${repositoriesList}`);
              }
              
              repositoriesList = forcedRepo;
            }
          } else {
            tl.setResult(tl.TaskResult.Failed, 'Forcing repo scope is only supported for GitHub repositories. Repo provider is ${provider}');
            return;
          }
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
    if(!repositoriesList)  {
      validateAccountType(accountType);
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

    const isOrg = accountType.toLowerCase() === constants.ACCOUNT_TYPE_ORG;
    const installationId = await githubService.getInstallationId(jwtToken, owner, isOrg , repositories);
    console.log(`Found installation ID: ${installationId}`);

    const token = await githubService.getInstallationToken(jwtToken, installationId, repositories);
    console.log('Installation token generated successfully');

    // Set the output variables
    tl.setVariable(constants.INSTALLATIONID_OUTPUT_VARNAME, installationId.toString(), false);
    tl.setVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, token, true); // secret

    // Save state for post job
    tl.setTaskVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME, token, true); // secret
    tl.setTaskVariable(constants.SKIP_TOKEN_TASK_VARNAME, skipTokenRevoke.toString());
    tl.setTaskVariable(constants.BASE_URL_TASK_VARNAME, baseUrl);

  } catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

run();