'use strict';

const express = require('express');

const bookingService = require('../services/booking.service');
const { requireAuth } = require('../middleware/auth');
const { bookingsCreated } = require('../middleware/metrics');

const router = express.Router();

router.use(requireAuth);

router.post('/', (req, res, next) => {
  try {
    const booking = bookingService.create({ ...(req.body || {}), userId: req.user.id });
    bookingsCreated.inc();
    res.status(201).json({ booking });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res, next) => {
  try {
    const bookings = bookingService.listForUser(req.user.id);
    res.json({ count: bookings.length, bookings });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json({ booking: bookingService.getById(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json({ booking: bookingService.cancel(req.params.id, req.user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
