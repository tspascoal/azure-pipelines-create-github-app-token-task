import * as constants from './constants';

export function validateRepositoryName(repo: string): boolean {
    const repoNameRegex = /^[a-zA-Z0-9._-]+$/;
    return repoNameRegex.test(repo);
}

export function validateAccountType(accountType: string) {
    const validAccountTypes = [constants.ACCOUNT_TYPE_ORG, constants.ACCOUNT_TYPE_USER, constants.ACCOUNT_TYPE_ENTERPRISE];
    if(!validAccountTypes.includes(accountType)) {
        throw new Error(`Invalid account type ${accountType}. Must be one of: ${validAccountTypes.join(', ')}`);
    }
}