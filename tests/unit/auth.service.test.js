'use strict';

const authService = require('../../src/services/auth.service');
const store = require('../../src/data/store');

beforeEach(() => store.reset());

describe('registration', () => {
  test('creates a student account by default and hides the password hash', () => {
    const user = authService.register({
      name: 'Alex Nguyen',
      email: 'Alex.Nguyen@example.com',
      password: 'Password123'
    });

    expect(user.role).toBe('student');
    expect(user.email).toBe('alex.nguyen@example.com');
    expect(user.passwordHash).toBeUndefined();
  });

  test('stores the password as a hash rather than plain text', () => {
    authService.register({
      name: 'Alex Nguyen',
      email: 'alex@example.com',
      password: 'Password123'
    });

    const stored = store.findUserByEmail('alex@example.com');
    expect(stored.passwordHash).not.toBe('Password123');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  test('rejects a short password', () => {
    expect(() =>
      authService.register({ name: 'Alex', email: 'a@b.com', password: 'short' })
    ).toThrow(/at least 8 characters/i);
  });

  test('rejects an invalid email address', () => {
    expect(() =>
      authService.register({ name: 'Alex', email: 'not-an-email', password: 'Password123' })
    ).toThrow(/valid email/i);
  });

  test('rejects a role that is not recognised', () => {
    expect(() =>
      authService.register({
        name: 'Alex',
        email: 'a@b.com',
        password: 'Password123',
        role: 'superuser'
      })
    ).toThrow(/Role must be one of/i);
  });

  test('rejects a duplicate email address', () => {
    authService.register({ name: 'Alex', email: 'a@b.com', password: 'Password123' });
    expect(() =>
      authService.register({ name: 'Other', email: 'A@B.com', password: 'Password123' })
    ).toThrow(/already exists/i);
  });
});

describe('login', () => {
  beforeEach(() => {
    authService.register({ name: 'Alex', email: 'a@b.com', password: 'Password123' });
  });

  test('returns a token for correct credentials', () => {
    const result = authService.login({ email: 'a@b.com', password: 'Password123' });
    expect(typeof result.token).toBe('string');
    expect(result.user.email).toBe('a@b.com');
  });

  test('gives the same message for a wrong password and an unknown account', () => {
    const wrongPassword = () => authService.login({ email: 'a@b.com', password: 'Wrong123456' });
    const unknownUser = () => authService.login({ email: 'nobody@b.com', password: 'Password123' });

    expect(wrongPassword).toThrow(/Invalid email or password/);
    expect(unknownUser).toThrow(/Invalid email or password/);
  });

  test('rejects a request with missing fields', () => {
    expect(() => authService.login({ email: 'a@b.com' })).toThrow(/required/i);
  });
});

describe('token verification', () => {
  test('reads back the identity stored in a freshly issued token', () => {
    authService.register({ name: 'Alex', email: 'a@b.com', password: 'Password123' });
    const { token, user } = authService.login({ email: 'a@b.com', password: 'Password123' });
    const payload = authService.verifyToken(token);

    expect(payload.sub).toBe(user.id);
    expect(payload.role).toBe('student');
  });

  test('rejects a token that has been tampered with', () => {
    expect(() => authService.verifyToken('not.a.real.token')).toThrow(/invalid or has expired/i);
  });
});
