'use strict';

const express = require('express');

const config = require('../config');
const store = require('../data/store');
const { register } = require('../middleware/metrics');

const router = express.Router();
const startedAt = Date.now();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: config.appVersion,
    environment: config.env,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    records: store.counts()
  });
});

router.get('/metrics', async (req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
