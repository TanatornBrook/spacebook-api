'use strict';

const express = require('express');

const authService = require('../services/auth.service');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res, next) => {
  try {
    res.status(201).json({ user: authService.register(req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', (req, res, next) => {
  try {
    res.json(authService.login(req.body || {}));
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
