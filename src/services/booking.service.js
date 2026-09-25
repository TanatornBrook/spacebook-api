'use strict';

const config = require('../config');
const store = require('../data/store');
const spaceService = require('./space.service');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError
} = require('../utils/errors');

const MS_PER_HOUR = 1000 * 60 * 60;

function parseDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} must be a valid ISO 8601 date and time`);
  }
  return date;
}

/**
 * Two bookings clash when one starts before the other finishes and finishes
 * after the other starts. Touching at the boundary (one finishes exactly when
 * the next starts) is allowed, which is why the comparisons are strict.
 */
function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function durationInHours(start, end) {
  return (end.getTime() - start.getTime()) / MS_PER_HOUR;
}

function validateWindow(start, end) {
  if (end <= start) {
    throw new ValidationError('The end time must be after the start time');
  }

  const hours = durationInHours(start, end);
  if (hours > config.maxBookingHours) {
    throw new ValidationError(
      `A single booking cannot be longer than ${config.maxBookingHours} hours`
    );
  }

  if (start.getHours() < config.openingHour || end.getHours() > config.closingHour) {
    throw new ValidationError(
      `Bookings must fall between ${config.openingHour}:00 and ${config.closingHour}:00`
    );
  }

  if (start.getTime() < Date.now()) {
    throw new ValidationError('Bookings cannot be made in the past');
  }
}

function findClash(spaceId, start, end, ignoreBookingId) {
  return store
    .listBookings({ spaceId, status: 'confirmed' })
    .find((booking) => {
      if (ignoreBookingId && booking.id === ignoreBookingId) return false;
      return overlaps(start, end, new Date(booking.startsAt), new Date(booking.endsAt));
    });
}

function create({ userId, spaceId, startsAt, endsAt, attendees }) {
  const space = spaceService.getById(spaceId);
  if (!space.active) {
    throw new ConflictError('This space is currently unavailable for booking');
  }

  const start = parseDate(startsAt, 'startsAt');
  const end = parseDate(endsAt, 'endsAt');
  validateWindow(start, end);

  const people = attendees === undefined ? 1 : attendees;
  if (!Number.isInteger(people) || people < 1) {
    throw new ValidationError('Attendees must be a whole number of at least 1');
  }
  if (people > space.capacity) {
    throw new ValidationError(
      `This space holds ${space.capacity} people, but ${people} were requested`
    );
  }

  if (findClash(spaceId, start, end)) {
    throw new ConflictError('That space is already booked for part of this time');
  }

  return store.createBooking({
    userId,
    spaceId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    attendees: people,
    status: 'confirmed'
  });
}

function listForUser(userId) {
  return store
    .listBookings({ userId })
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

function getById(id) {
  const booking = store.findBookingById(id);
  if (!booking) {
    throw new NotFoundError(`Booking ${id} was not found`);
  }
  return booking;
}

function cancel(id, requester) {
  const booking = getById(id);

  if (booking.userId !== requester.id && requester.role !== 'admin') {
    throw new ForbiddenError('You can only cancel your own bookings');
  }
  if (booking.status === 'cancelled') {
    throw new ConflictError('This booking has already been cancelled');
  }

  return store.updateBooking(id, { status: 'cancelled' });
}

/**
 * Returns the hour-long slots that are still free for a space on a given day.
 * The endpoint behind this is what the front end uses to grey out times, so it
 * has its own unit tests.
 */
function availability(spaceId, dayIso) {
  spaceService.getById(spaceId);

  const day = parseDate(dayIso, 'date');
  const booked = store.listBookings({ spaceId, status: 'confirmed' });
  const slots = [];

  for (let hour = config.openingHour; hour < config.closingHour; hour += 1) {
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + MS_PER_HOUR);

    const taken = booked.some((b) =>
      overlaps(slotStart, slotEnd, new Date(b.startsAt), new Date(b.endsAt))
    );

    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      available: !taken
    });
  }

  return slots;
}

module.exports = {
  create,
  listForUser,
  getById,
  cancel,
  availability,
  overlaps,
  durationInHours
};
