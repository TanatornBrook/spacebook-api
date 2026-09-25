'use strict';

const { AppError } = require('../utils/errors');

function notFound(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route matches ${req.method} ${req.originalUrl}` }
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message }
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled error:', err);
  }

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' }
  });
}

module.exports = { notFound, errorHandler };
