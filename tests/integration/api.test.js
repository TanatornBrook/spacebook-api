'use strict';

const request = require('supertest');

const createApp = require('../../src/app');
const store = require('../../src/data/store');
const authService = require('../../src/services/auth.service');

const app = createApp();

function futureTime(daysAhead, hour) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function tokenFor(role) {
  const email = `${role}-${Date.now()}-${Math.random()}@example.com`;
  authService.register({ name: `Test ${role}`, email, password: 'Password123', role });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Password123' });
  return res.body.token;
}

beforeEach(() => {
  store.reset();
  store.seedSpaces();
});

describe('health and metrics endpoints', () => {
  test('GET /health reports the service as ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBeDefined();
  });

  test('GET /metrics exposes Prometheus formatted metrics', async () => {
    await request(app).get('/health');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('spacebook_http_requests_total');
  });

  test('an unknown route returns a structured 404', async () => {
    const res = await request(app).get('/api/nowhere');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('authentication endpoints', () => {
  test('POST /api/auth/register creates an account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sam Lee', email: 'sam@example.com', password: 'Password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('student');
  });

  test('POST /api/auth/register rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sam Lee', email: 'sam@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/auth/login returns a token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sam Lee', email: 'sam@example.com', password: 'Password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sam@example.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login rejects a bad password with 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Sam Lee', email: 'sam@example.com', password: 'Password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sam@example.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me needs a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('space endpoints', () => {
  test('GET /api/spaces is open to anyone', async () => {
    const res = await request(app).get('/api/spaces');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });

  test('GET /api/spaces filters by campus', async () => {
    const res = await request(app).get('/api/spaces?campus=Burwood');
    expect(res.body.count).toBe(1);
  });

  test('GET /api/spaces/:id/availability returns the day\u2019s slots', async () => {
    const list = await request(app).get('/api/spaces');
    const id = list.body.spaces[0].id;

    const res = await request(app).get(`/api/spaces/${id}/availability?date=${futureTime(1, 12)}`);
    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBe(15);
  });

  test('POST /api/spaces is refused for a student', async () => {
    const token = await tokenFor('student');
    const res = await request(app)
      .post('/api/spaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Pod', campus: 'Burwood', capacity: 4 });

    expect(res.status).toBe(403);
  });

  test('POST /api/spaces succeeds for an administrator', async () => {
    const token = await tokenFor('admin');
    const res = await request(app)
      .post('/api/spaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Pod', campus: 'Burwood', capacity: 4 });

    expect(res.status).toBe(201);
    expect(res.body.space.name).toBe('New Pod');
  });

  test('DELETE /api/spaces/:id removes a space for an administrator', async () => {
    const token = await tokenFor('admin');
    const list = await request(app).get('/api/spaces');
    const id = list.body.spaces[0].id;

    const res = await request(app)
      .delete(`/api/spaces/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});

describe('booking endpoints', () => {
  test('the full booking journey works end to end', async () => {
    const token = await tokenFor('student');
    const list = await request(app).get('/api/spaces');
    const spaceId = list.body.spaces[0].id;

    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ spaceId, startsAt: futureTime(1, 9), endsAt: futureTime(1, 11), attendees: 2 });

    expect(created.status).toBe(201);

    const mine = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${token}`);

    expect(mine.body.count).toBe(1);

    const cancelled = await request(app)
      .delete(`/api/bookings/${created.body.booking.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(cancelled.body.booking.status).toBe('cancelled');
  });

  test('a clashing booking is refused with 409', async () => {
    const tokenA = await tokenFor('student');
    const tokenB = await tokenFor('student');
    const list = await request(app).get('/api/spaces');
    const spaceId = list.body.spaces[0].id;

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spaceId, startsAt: futureTime(2, 9), endsAt: futureTime(2, 11) });

    const clash = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ spaceId, startsAt: futureTime(2, 10), endsAt: futureTime(2, 12) });

    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('CONFLICT');
  });

  test('a student cannot cancel another student\u2019s booking', async () => {
    const tokenA = await tokenFor('student');
    const tokenB = await tokenFor('student');
    const list = await request(app).get('/api/spaces');
    const spaceId = list.body.spaces[0].id;

    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ spaceId, startsAt: futureTime(3, 9), endsAt: futureTime(3, 10) });

    const res = await request(app)
      .delete(`/api/bookings/${created.body.booking.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(403);
  });

  test('booking without a token is refused', async () => {
    const list = await request(app).get('/api/spaces');
    const res = await request(app)
      .post('/api/bookings')
      .send({ spaceId: list.body.spaces[0].id, startsAt: futureTime(1, 9), endsAt: futureTime(1, 10) });

    expect(res.status).toBe(401);
  });
});
