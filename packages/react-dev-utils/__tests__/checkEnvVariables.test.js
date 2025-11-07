/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const checkEnvVariables = require('../checkEnvVariables');

describe('checkEnvVariables', () => {
  let tempDir;
  let originalEnv;
  let originalNodeEnv;
  let consoleLogSpy;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-check-test-'));

    // Save original environment
    originalEnv = { ...process.env };
    originalNodeEnv = process.env.NODE_ENV;

    // Set to development mode
    process.env.NODE_ENV = 'development';

    // Clear REACT_APP_ variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('REACT_APP_')) {
        delete process.env[key];
      }
    });

    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;

    // Restore console.log
    consoleLogSpy.mockRestore();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should not warn when all referenced variables are defined', () => {
    // Create a test file with env variable reference
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Define the variable
    process.env.REACT_APP_API_URL = 'https://api.example.com';

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should return true and not log warnings
    expect(result).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not defined')
    );
  });

  test('should warn when referenced variables are undefined', () => {
    // Create a test file with env variable reference
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Don't define the variable

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should return true but log warnings
    expect(result).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalled();
    const logOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/REACT_APP_API_URL/);
    expect(logOutput).toMatch(/not defined/);
  });

  test('should suggest similar variable names for typos', () => {
    // Create a test file with a typo
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(
      testFile,
      'const apiUrl = process.env.REACT_APP_API_ULR;' // Typo: ULR instead of URL
    );

    // Define the correct variable
    process.env.REACT_APP_API_URL = 'https://api.example.com';

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should suggest the correct variable name
    expect(result).toBe(true);
    const logOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/Did you mean.*REACT_APP_API_URL/);
  });

  test('should handle multiple undefined variables', () => {
    // Create a test file with multiple undefined variables
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(
      testFile,
      `
        const apiUrl = process.env.REACT_APP_API_URL;
        const apiKey = process.env.REACT_APP_API_KEY;
      `
    );

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should warn about both variables
    expect(result).toBe(true);
    const logOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/REACT_APP_API_URL/);
    expect(logOutput).toMatch(/REACT_APP_API_KEY/);
  });

  test('should skip check when NODE_ENV is not development', () => {
    // Set to production mode
    process.env.NODE_ENV = 'production';

    // Create a test file with undefined variable
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should return true without checking
    expect(result).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('should skip check when DISABLE_ENV_CHECK is true', () => {
    // Disable the check
    process.env.DISABLE_ENV_CHECK = 'true';

    // Create a test file with undefined variable
    const testFile = path.join(tempDir, 'App.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should return true without checking
    expect(result).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  test('should handle files in subdirectories', () => {
    // Create a subdirectory
    const subDir = path.join(tempDir, 'components');
    fs.mkdirSync(subDir);

    // Create a test file in subdirectory
    const testFile = path.join(subDir, 'Component.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should find the variable reference in subdirectory
    expect(result).toBe(true);
    const logOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/REACT_APP_API_URL/);
  });

  test('should handle TypeScript files', () => {
    // Create a TypeScript file
    const testFile = path.join(tempDir, 'App.tsx');
    fs.writeFileSync(
      testFile,
      'const apiUrl: string = process.env.REACT_APP_API_URL || "";'
    );

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should find the variable reference in TypeScript file
    expect(result).toBe(true);
    const logOutput = consoleLogSpy.mock.calls.flat().join(' ');
    expect(logOutput).toMatch(/REACT_APP_API_URL/);
  });

  test('should ignore test files', () => {
    // Create a test file that references an env variable
    const testFile = path.join(tempDir, 'App.test.js');
    fs.writeFileSync(testFile, 'const apiUrl = process.env.REACT_APP_API_URL;');

    // Run the check
    const result = checkEnvVariables(tempDir, false);

    // Should not warn about variables in test files
    expect(result).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('REACT_APP_API_URL')
    );
  });

  test('should handle errors gracefully', () => {
    // Pass a non-existent directory
    const result = checkEnvVariables('/non/existent/path', false);

    // Should return true and not throw
    expect(result).toBe(true);
  });

  test('should handle empty directory', () => {
    // Run check on empty directory
    const result = checkEnvVariables(tempDir, false);

    // Should return true without warnings
    expect(result).toBe(true);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('not defined')
    );
  });
});
