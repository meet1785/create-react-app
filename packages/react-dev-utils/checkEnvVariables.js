/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const globby = require('globby');

/**
 * Calculates the Levenshtein distance between two strings
 * Used for fuzzy matching to suggest corrections for typos
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Finds the closest matching environment variable name
 */
function findClosestMatch(target, candidates) {
  let closestMatch = null;
  let closestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate);
    if (distance < closestDistance && distance <= 3) {
      closestDistance = distance;
      closestMatch = candidate;
    }
  }

  return closestMatch;
}

/**
 * Scans source files for process.env.REACT_APP_* references
 */
function findEnvVariableReferences(appSrc) {
  const files = globby.sync(['**/*.{js,jsx,ts,tsx}'], {
    cwd: appSrc,
    absolute: true,
    ignore: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**'],
  });

  const referencedVars = new Set();
  const regex = /process\.env\.(REACT_APP_[A-Z0-9_]+)/g;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      while ((match = regex.exec(content)) !== null) {
        referencedVars.add(match[1]);
      }
    } catch (err) {
      // Ignore files that can't be read
    }
  }

  return Array.from(referencedVars);
}

/**
 * Gets all defined REACT_APP_* environment variables
 */
function getDefinedEnvVariables() {
  const defined = new Set();

  for (const key in process.env) {
    if (/^REACT_APP_/i.test(key)) {
      defined.add(key);
    }
  }

  return Array.from(defined);
}

/**
 * Checks if referenced environment variables are defined and warns about missing ones
 */
function checkEnvVariables(appSrc, isInteractive = true) {
  // Only run in development mode
  if (process.env.NODE_ENV !== 'development') {
    return true;
  }

  // Allow users to opt-out via environment variable
  if (process.env.DISABLE_ENV_CHECK === 'true') {
    return true;
  }

  try {
    const referencedVars = findEnvVariableReferences(appSrc);
    const definedVars = getDefinedEnvVariables();

    if (referencedVars.length === 0) {
      return true;
    }

    const missingVars = referencedVars.filter(
      varName => !definedVars.includes(varName)
    );

    if (missingVars.length > 0) {
      console.log();
      console.log(
        chalk.yellow('Warning: ') +
          'The following environment variables are referenced in your code but not defined:'
      );
      console.log();

      for (const missingVar of missingVars) {
        console.log(`  ${chalk.cyan(missingVar)}`);

        const suggestion = findClosestMatch(missingVar, definedVars);
        if (suggestion) {
          console.log(
            `    ${chalk.dim('Did you mean')} ${chalk.cyan(
              suggestion
            )}${chalk.dim('?')}`
          );
        }
      }

      console.log();
      console.log(
        'To fix this, add the missing variables to your ' +
          chalk.cyan('.env') +
          ' file or set them in your environment.'
      );
      console.log(
        'For example, add this line to your ' + chalk.cyan('.env') + ' file:'
      );
      console.log();
      console.log(chalk.dim('  ' + missingVars[0] + '=your_value_here'));
      console.log();
      console.log(
        'Learn more: ' +
          chalk.cyan(
            'https://facebook.github.io/create-react-app/docs/adding-custom-environment-variables'
          )
      );
      console.log();
      console.log(
        chalk.dim(
          'To disable this check, set DISABLE_ENV_CHECK=true in your environment.'
        )
      );
      console.log();
    }

    return true;
  } catch (err) {
    // If validation fails for any reason, don't block the build
    if (isInteractive) {
      console.log();
      console.log(
        chalk.yellow(
          'Warning: Unable to validate environment variables. Continuing anyway.'
        )
      );
      console.log();
    }
    return true;
  }
}

module.exports = checkEnvVariables;
