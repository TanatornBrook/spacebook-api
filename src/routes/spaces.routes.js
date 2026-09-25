'use strict';

const express = require('express');

const spaceService = require('../services/space.service');
const bookingService = require('../services/booking.service');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const spaces = spaceService.list({
      campus: req.query.campus,
      minCapacity: req.query.minCapacity,
      activeOnly: req.query.activeOnly === 'true'
    });
    res.json({ count: spaces.length, spaces });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json({ space: spaceService.getById(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/availability', (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString();
    res.json({ spaceId: req.params.id, slots: bookingService.availability(req.params.id, date) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    res.status(201).json({ space: spaceService.create(req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    res.json({ space: spaceService.update(req.params.id, req.body || {}) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res, next) => {
  try {
    spaceService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
