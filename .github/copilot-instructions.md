# Azure Pipelines GitHub App Token Extension

This project implements an Azure DevOps extension that generates GitHub App installation tokens for API authentication. Understanding the Azure Pipelines task SDK and extension architecture is crucial for effective contributions.

The code is implemented in TypeScript and uses the Azure DevOps Task SDK to interact with pipeline tasks. 

## Architecture Overview

**Core Components:**
- `create-github-app-token/src/tasks/run.ts` - Main task execution logic
- `create-github-app-token/src/tasks/post.ts` - Post-job cleanup (token revocation)
- `create-github-app-token/src/core/github-service.ts` - GitHub API interactions
- `vss-extension.json` - Azure DevOps Extension manifest defining tasks and service connections
- `create-github-app-token/task.json` - Pipeline Task definition

**Key Design Patterns:**
- Dual authentication modes: Service Connection (preferred) vs Direct Inputs
- JWT-based GitHub App authentication flow: App JWT → Installation ID → Installation Token
- Automatic token revocation via post-job execution unless `skipTokenRevoke: true`
- Proxy support through Azure Pipelines environment variables

## Development Workflow

**Build Process:**
```bash
cd create-github-app-token
npm run build    # TypeScript compilation to dist/
npm run package  # Bundle with ncc to lib/ (what's actually executed)
```

**Extension Packaging:**
- Uses `tfx-cli` to create `.vsix` packages
- Set `PUBLISHER` variable before packaging (or override in command line)
- Both GitHub Actions and Azure Pipelines CI available

**Task Execution Flow:**
1. Input validation and credential resolution (service connection > certificate input > certificate file)
2. JWT generation using GitHub App credentials
3. Installation ID lookup (org/user/repo-specific endpoints)
4. Installation token creation with optional repository/permission scoping
5. Output variables set for pipeline consumption
6. Post-job token revocation (unless disabled)

## Critical Implementation Details

**Service Connection Integration:**
- Custom endpoint type `githubappauthentication` defined in `vss-extension.json`
- Service connections can override task-level permissions via `limitPermissions`
- `forceRepoScope` forces token scoping to current repository (GitHub repos only)

**GitHub API Specifics:**
- JWT tokens expire in 10 minutes
- Installation tokens are repository-scoped when `repositories` array provided
- Permission downgrading only - cannot request more than app has
- Three installation ID endpoints: `/orgs/{org}`, `/users/{user}`, `/repos/{owner}/{repo}`

**Error Handling Patterns:**
- 404 errors provide context-specific messages (app not installed, wrong owner type)
- 422 errors indicate permission/repository scope issues
- Repository name validation prevents injection attacks
- Graceful post-job failures (logs errors but doesn't fail task)

**Azure Pipelines Specifics:**
- Task variables (`tl.setTaskVariable`) persist between main and post execution
- Secret variables marked with `true` parameter in `tl.setVariable`
- Repository provider detection via `Build.Repository.Provider`
- Automatic owner extraction from `Build.Repository.Name` for GitHub repos

## Testing & Debugging

**Local Testing:**
- No formal test suite - extension requires Azure DevOps environment
- Debug logging enabled via `tl.debug()` calls throughout
- Response headers and payloads logged in debug mode

**Key Variables for Debugging:**
- Check task logs for "##[group]" sections showing API calls
- Output variables: `installationToken`, `installationId`, `tokenExpiration`
- Proxy configuration automatically detected from environment variables

## Common Pitfalls

- Service connection permissions override task-level permissions
- Repository names must match GitHub's naming rules (ASCII letters, digits, `.`, `-`, `_`)
- `forceRepoScope` only works with GitHub as the repository provider
- JWT generation requires proper PEM formatting with headers/footers
- Installation tokens are automatically revoked at the end of job execution unless explicitly disabled
