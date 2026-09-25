'use strict';

const pkg = require('../package.json');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'spacebook-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  appVersion: process.env.APP_VERSION || pkg.version,
  maxBookingHours: parseInt(process.env.MAX_BOOKING_HOURS, 10) || 4,
  openingHour: parseInt(process.env.OPENING_HOUR, 10) || 7,
  closingHour: parseInt(process.env.CLOSING_HOUR, 10) || 22
};

module.exports = config;
