'use strict';

const authService = require('../services/auth.service');
const { AuthError, ForbiddenError } = require('../utils/errors');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AuthError('A bearer token is required'));
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(new AuthError('A bearer token is required'));
    }
    if (req.user.role !== role) {
      return next(new ForbiddenError(`This action requires the ${role} role`));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
