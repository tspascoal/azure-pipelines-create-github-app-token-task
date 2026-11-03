import * as tl from 'azure-pipelines-task-lib/task';
import { GitHubService } from '../core/github-service';
import { ProxyConfig } from '../core/proxy-config';
import * as constants from '../utils/constants';

const MAX_REVOCATION_ATTEMPTS = 3;

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

    for (let attempt = 1; attempt <= MAX_REVOCATION_ATTEMPTS; attempt++) {
      try {
        const success = await githubService.revokeInstallationToken(token);
        if (success) {
          console.log('GitHub App installation token cleanup completed; token revoked or already invalid');
          return;
        }
      } catch (err: any) {
        console.log(`Token revocation attempt ${attempt} failed: ${err.message}`);
      }

      if (attempt < MAX_REVOCATION_ATTEMPTS) {
        console.log(`Retrying token revocation (${attempt + 1}/${MAX_REVOCATION_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    const message = `Failed to revoke GitHub App installation token after ${MAX_REVOCATION_ATTEMPTS} attempts`;
    tl.error(message);
    tl.setResult(tl.TaskResult.Failed, message);
  } catch (err: any) {
    tl.error(`Error in post-execution: ${err.message}`);
    tl.setResult(tl.TaskResult.Failed, `Error in post-execution: ${err.message}`);
  }
}

// Only run if this module is executed directly (not imported)
if (require.main === module) {
  run();
}

// Export for testing
export { run };
