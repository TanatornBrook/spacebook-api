'use strict';

const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'spacebook_' });

const httpRequestsTotal = new client.Counter({
  name: 'spacebook_http_requests_total',
  help: 'Total number of HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: 'spacebook_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
  registers: [register]
});

const bookingsCreated = new client.Counter({
  name: 'spacebook_bookings_created_total',
  help: 'Total number of bookings successfully created',
  registers: [register]
});

function metricsMiddleware(req, res, next) {
  const stop = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    stop(labels);
  });
  next();
}

module.exports = { register, metricsMiddleware, bookingsCreated };
