'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const config = require('../config');
const store = require('../data/store');
const { ValidationError, AuthError, ConflictError } = require('../utils/errors');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ['student', 'admin'];
const SALT_ROUNDS = 10;

function validateRegistration({ name, email, password, role }) {
  if (!name || name.trim().length < 2) {
    throw new ValidationError('Name must be at least 2 characters long');
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('A valid email address is required');
  }
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long');
  }
  if (role && !ALLOWED_ROLES.includes(role)) {
    throw new ValidationError(`Role must be one of: ${ALLOWED_ROLES.join(', ')}`);
  }
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function register({ name, email, password, role }) {
  validateRegistration({ name, email, password, role });

  if (store.findUserByEmail(email)) {
    throw new ConflictError('An account with this email already exists');
  }

  const user = store.createUser({
    name: name.trim(),
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, SALT_ROUNDS),
    role: role || 'student'
  });

  return toPublicUser(user);
}

function login({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  const user = store.findUserByEmail(email);
  // The same message is returned whether the email or the password is wrong,
  // so the response cannot be used to confirm which accounts exist.
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    throw new AuthError('Invalid email or password');
  }

  const token = jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return { token, user: toPublicUser(user) };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw new AuthError('Token is invalid or has expired');
  }
}

module.exports = { register, login, verifyToken, toPublicUser, ALLOWED_ROLES };
