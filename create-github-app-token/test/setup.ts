// Jest setup file for Azure Pipelines GitHub App Token extension tests

import 'jest';

// Mock Azure Pipelines Task Lib at the global level
jest.mock('azure-pipelines-task-lib/task', () => ({
  setResult: jest.fn(),
  TaskResult: {
    Failed: 1,
    Succeeded: 0,
    SucceededWithIssues: 2,
    Cancelled: 3,
    Skipped: 4
  },
  getInput: jest.fn(),
  getBoolInput: jest.fn(),
  getVariable: jest.fn(),
  setVariable: jest.fn(),
  setTaskVariable: jest.fn(),
  getTaskVariable: jest.fn(),
  getEndpointAuthorization: jest.fn(),
  getHttpProxyConfiguration: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}));

// Mock jsonwebtoken to prevent actual JWT operations
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock.jwt.token')
}));

// Mock fs module for file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

// Global test setup
beforeEach(() => {
  // Clear any environment variables that might interfere with tests
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.NO_PROXY;
  
  // Reset console methods for test isolation
  jest.clearAllMocks();
});

// Global test timeout
jest.setTimeout(10000);
