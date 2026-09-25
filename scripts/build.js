'use strict';

/**
 * Produces the build metadata that ships with the container image. Jenkins
 * passes the build number and the Git commit in as environment variables so
 * that a running container can be traced back to the exact pipeline run and
 * commit that produced it.
 */

const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');

const info = {
  name: pkg.name,
  version: pkg.version,
  buildNumber: process.env.BUILD_NUMBER || 'local',
  gitCommit: process.env.GIT_COMMIT || 'unknown',
  builtAt: new Date().toISOString(),
  nodeVersion: process.version
};

const outDir = path.join(__dirname, '..', 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify(info, null, 2));

console.log('Build metadata written to dist/build-info.json');
console.log(JSON.stringify(info, null, 2));
