'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const { metricsMiddleware } = require('./middleware/metrics');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const spaceRoutes = require('./routes/spaces.routes');
const bookingRoutes = require('./routes/bookings.routes');
const healthRoutes = require('./routes/health.routes');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  if (config.env !== 'test') {
    app.use(morgan('combined'));
  }
  app.use(metricsMiddleware);

  app.use('/', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/spaces', spaceRoutes);
  app.use('/api/bookings', bookingRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
