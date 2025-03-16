import * as tl from 'azure-pipelines-task-lib/task';
import { GitHubService } from '../core/github-service';
import { ProxyConfig } from '../core/proxy-config';
import * as constants from '../utils/constants';

async function run(): Promise<void> {
  try {
    // Check if token revocation should be skipped
    const skipTokenRevoke :boolean = JSON.parse(tl.getTaskVariable(constants.SKIP_TOKEN_TASK_VARNAME) || 'false');
    let baseUrl = tl.getTaskVariable(constants.BASE_URL_TASK_VARNAME) || constants.DEFAULT_API_URL;

    console.log('GitHub App token revocation post-execution started');
    console.log(`skipTokenRevoke: ${skipTokenRevoke}`);
    console.log(`baseUrl: ${baseUrl}`);
    console.log('\nStarting');
    
    if (skipTokenRevoke) {
      console.log('Token revocation skipped as specified by skipTokenRevoke input');
      return;
    }

    // Get the installation token from the saved state
    const token = tl.getTaskVariable(constants.INSTALLATION_TOKEN_OUTPUT_VARNAME);
    if (!token) {
      console.log('No installation token found in saved state to revoke token.');
      return;
    }
    
    // Setup proxy if needed
    const proxyConfig = ProxyConfig.fromAzurePipelines(baseUrl);
    const githubService = new GitHubService(baseUrl, { proxy: proxyConfig });

    // Revoke the token
    const success = await githubService.revokeInstallationToken(token);
    if (success) {
      console.log('GitHub App installation token has been successfully revoked');
    } else {
      console.log('Failed to revoke GitHub App installation token');
    }

  } catch (err: any) {
    // Log errors but don't fail the task
    tl.error(`Error in post-execution: ${err.message}`);
  }
}

run();