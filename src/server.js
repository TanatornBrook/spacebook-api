'use strict';

const createApp = require('./app');
const config = require('./config');
const store = require('./data/store');
const authService = require('./services/auth.service');

// Seed a small set of spaces and an administrator so the container is useful
// the moment it starts. In a production deployment this would be a migration.
store.seedSpaces();
if (!store.findUserByEmail('admin@spacebook.local')) {
  authService.register({
    name: 'Space Administrator',
    email: 'admin@spacebook.local',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
    role: 'admin'
  });
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(
    `SpaceBook API v${config.appVersion} listening on port ${config.port} (${config.env})`
  );
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
