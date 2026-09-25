'use strict';

const bookingService = require('../../src/services/booking.service');
const spaceService = require('../../src/services/space.service');
const store = require('../../src/data/store');

/** Builds an ISO timestamp a number of days ahead at a set hour. */
function futureTime(daysAhead, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

let space;

beforeEach(() => {
  store.reset();
  space = spaceService.create({
    name: 'Test Pod',
    campus: 'Burwood',
    capacity: 4,
    hasWhiteboard: true
  });
});

describe('overlap detection', () => {
  const base = new Date('2026-10-01T10:00:00');
  const baseEnd = new Date('2026-10-01T12:00:00');

  test('reports an overlap when one booking starts inside another', () => {
    const start = new Date('2026-10-01T11:00:00');
    const end = new Date('2026-10-01T13:00:00');
    expect(bookingService.overlaps(base, baseEnd, start, end)).toBe(true);
  });

  test('reports an overlap when one booking completely contains another', () => {
    const start = new Date('2026-10-01T10:30:00');
    const end = new Date('2026-10-01T11:00:00');
    expect(bookingService.overlaps(base, baseEnd, start, end)).toBe(true);
  });

  test('allows two bookings that touch at the boundary', () => {
    const start = new Date('2026-10-01T12:00:00');
    const end = new Date('2026-10-01T13:00:00');
    expect(bookingService.overlaps(base, baseEnd, start, end)).toBe(false);
  });

  test('allows bookings that are clearly apart', () => {
    const start = new Date('2026-10-01T15:00:00');
    const end = new Date('2026-10-01T16:00:00');
    expect(bookingService.overlaps(base, baseEnd, start, end)).toBe(false);
  });
});

describe('duration calculation', () => {
  test('returns the number of hours between two times', () => {
    const start = new Date('2026-10-01T09:00:00');
    const end = new Date('2026-10-01T11:30:00');
    expect(bookingService.durationInHours(start, end)).toBe(2.5);
  });
});

describe('creating a booking', () => {
  test('stores a confirmed booking for a valid request', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 11),
      attendees: 3
    });

    expect(booking.status).toBe('confirmed');
    expect(booking.spaceId).toBe(space.id);
    expect(booking.attendees).toBe(3);
  });

  test('defaults to one attendee when none is supplied', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 10)
    });

    expect(booking.attendees).toBe(1);
  });

  test('rejects a second booking that clashes with an existing one', () => {
    bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(2, 9),
      endsAt: futureTime(2, 11)
    });

    expect(() =>
      bookingService.create({
        userId: 'user-2',
        spaceId: space.id,
        startsAt: futureTime(2, 10),
        endsAt: futureTime(2, 12)
      })
    ).toThrow(/already booked/i);
  });

  test('allows a booking that starts exactly when another finishes', () => {
    bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(3, 9),
      endsAt: futureTime(3, 11)
    });

    const second = bookingService.create({
      userId: 'user-2',
      spaceId: space.id,
      startsAt: futureTime(3, 11),
      endsAt: futureTime(3, 13)
    });

    expect(second.status).toBe('confirmed');
  });

  test('ignores cancelled bookings when checking for clashes', () => {
    const first = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(4, 9),
      endsAt: futureTime(4, 11)
    });
    bookingService.cancel(first.id, { id: 'user-1', role: 'student' });

    const second = bookingService.create({
      userId: 'user-2',
      spaceId: space.id,
      startsAt: futureTime(4, 9),
      endsAt: futureTime(4, 11)
    });

    expect(second.status).toBe('confirmed');
  });

  test('rejects a booking longer than the maximum allowed', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(1, 9),
        endsAt: futureTime(1, 20)
      })
    ).toThrow(/cannot be longer than/i);
  });

  test('rejects a booking that ends before it starts', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(1, 12),
        endsAt: futureTime(1, 10)
      })
    ).toThrow(/end time must be after/i);
  });

  test('rejects a booking outside opening hours', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(1, 5),
        endsAt: futureTime(1, 6)
      })
    ).toThrow(/between/i);
  });

  test('rejects a booking placed in the past', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(-2, 9),
        endsAt: futureTime(-2, 10)
      })
    ).toThrow(/in the past/i);
  });

  test('rejects more attendees than the space can hold', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(1, 9),
        endsAt: futureTime(1, 10),
        attendees: 10
      })
    ).toThrow(/holds 4 people/i);
  });

  test('rejects a booking for a space that does not exist', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: 'space-999',
        startsAt: futureTime(1, 9),
        endsAt: futureTime(1, 10)
      })
    ).toThrow(/not found/i);
  });

  test('rejects a booking for a space that has been deactivated', () => {
    spaceService.update(space.id, { active: false });

    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: futureTime(1, 9),
        endsAt: futureTime(1, 10)
      })
    ).toThrow(/currently unavailable/i);
  });

  test('rejects a start time that is not a real date', () => {
    expect(() =>
      bookingService.create({
        userId: 'user-1',
        spaceId: space.id,
        startsAt: 'next tuesday',
        endsAt: futureTime(1, 10)
      })
    ).toThrow(/valid ISO 8601/i);
  });
});

describe('cancelling a booking', () => {
  test('lets the owner cancel their own booking', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 10)
    });

    const cancelled = bookingService.cancel(booking.id, { id: 'user-1', role: 'student' });
    expect(cancelled.status).toBe('cancelled');
  });

  test('stops a student cancelling someone else\u2019s booking', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 10)
    });

    expect(() => bookingService.cancel(booking.id, { id: 'user-2', role: 'student' })).toThrow(
      /only cancel your own/i
    );
  });

  test('lets an administrator cancel any booking', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 10)
    });

    const cancelled = bookingService.cancel(booking.id, { id: 'admin-1', role: 'admin' });
    expect(cancelled.status).toBe('cancelled');
  });

  test('refuses to cancel the same booking twice', () => {
    const booking = bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 9),
      endsAt: futureTime(1, 10)
    });
    bookingService.cancel(booking.id, { id: 'user-1', role: 'student' });

    expect(() => bookingService.cancel(booking.id, { id: 'user-1', role: 'student' })).toThrow(
      /already been cancelled/i
    );
  });
});

describe('availability', () => {
  test('returns one slot for every opening hour', () => {
    const slots = bookingService.availability(space.id, futureTime(1, 12));
    expect(slots).toHaveLength(15);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  test('marks the booked hours as unavailable', () => {
    bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(1, 10),
      endsAt: futureTime(1, 12)
    });

    const slots = bookingService.availability(space.id, futureTime(1, 12));
    const unavailable = slots.filter((s) => !s.available);

    expect(unavailable).toHaveLength(2);
    expect(new Date(unavailable[0].startsAt).getHours()).toBe(10);
  });
});

describe('listing bookings', () => {
  test('returns only the requesting user\u2019s bookings, earliest first', () => {
    bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(5, 14),
      endsAt: futureTime(5, 15)
    });
    bookingService.create({
      userId: 'user-1',
      spaceId: space.id,
      startsAt: futureTime(5, 9),
      endsAt: futureTime(5, 10)
    });
    bookingService.create({
      userId: 'user-2',
      spaceId: space.id,
      startsAt: futureTime(6, 9),
      endsAt: futureTime(6, 10)
    });

    const mine = bookingService.listForUser('user-1');
    expect(mine).toHaveLength(2);
    expect(new Date(mine[0].startsAt).getHours()).toBe(9);
  });
});
