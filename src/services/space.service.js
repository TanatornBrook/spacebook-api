'use strict';

const store = require('../data/store');
const { ValidationError, NotFoundError } = require('../utils/errors');

const CAMPUSES = ['Burwood', 'Waurn Ponds', 'Waterfront', 'Warrnambool'];

function validateSpace({ name, campus, capacity }) {
  if (!name || name.trim().length < 3) {
    throw new ValidationError('Space name must be at least 3 characters long');
  }
  if (!campus || !CAMPUSES.includes(campus)) {
    throw new ValidationError(`Campus must be one of: ${CAMPUSES.join(', ')}`);
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
    throw new ValidationError('Capacity must be a whole number between 1 and 20');
  }
}

function create(payload) {
  validateSpace(payload);
  return store.createSpace({
    name: payload.name.trim(),
    campus: payload.campus,
    capacity: payload.capacity,
    hasWhiteboard: Boolean(payload.hasWhiteboard),
    hasMonitor: Boolean(payload.hasMonitor),
    active: payload.active === undefined ? true : Boolean(payload.active)
  });
}

function list(filter = {}) {
  let spaces = store.listSpaces();

  if (filter.campus) {
    spaces = spaces.filter((s) => s.campus === filter.campus);
  }
  if (filter.minCapacity) {
    const min = parseInt(filter.minCapacity, 10);
    if (Number.isNaN(min)) {
      throw new ValidationError('minCapacity must be a number');
    }
    spaces = spaces.filter((s) => s.capacity >= min);
  }
  if (filter.activeOnly) {
    spaces = spaces.filter((s) => s.active);
  }

  return spaces;
}

function getById(id) {
  const space = store.findSpaceById(id);
  if (!space) {
    throw new NotFoundError(`Space ${id} was not found`);
  }
  return space;
}

function update(id, changes) {
  const existing = getById(id);
  const merged = { ...existing, ...changes };
  validateSpace(merged);
  return store.updateSpace(id, changes);
}

function remove(id) {
  getById(id);
  return store.deleteSpace(id);
}

module.exports = { create, list, getById, update, remove, CAMPUSES };
