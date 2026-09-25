'use strict';

/**
 * A very small in-memory repository.
 *
 * A real deployment would sit on top of a database, but keeping the storage
 * layer in memory means the API has no native dependencies, so it builds and
 * runs identically on a laptop, inside a Jenkins agent and inside a container.
 * Every service talks to the store through these functions, so swapping it for
 * a database later would only change this file.
 */

const state = {
  users: [],
  spaces: [],
  bookings: [],
  sequences: { user: 0, space: 0, booking: 0 }
};

function nextId(entity) {
  state.sequences[entity] += 1;
  return `${entity}-${state.sequences[entity]}`;
}

/* ------------------------------ users ------------------------------ */

function createUser(user) {
  const record = { id: nextId('user'), createdAt: new Date().toISOString(), ...user };
  state.users.push(record);
  return record;
}

function findUserByEmail(email) {
  if (!email) return undefined;
  return state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id) {
  return state.users.find((u) => u.id === id);
}

/* ------------------------------ spaces ------------------------------ */

function createSpace(space) {
  const record = { id: nextId('space'), createdAt: new Date().toISOString(), ...space };
  state.spaces.push(record);
  return record;
}

function listSpaces() {
  return [...state.spaces];
}

function findSpaceById(id) {
  return state.spaces.find((s) => s.id === id);
}

function updateSpace(id, changes) {
  const space = findSpaceById(id);
  if (!space) return undefined;
  Object.assign(space, changes, { updatedAt: new Date().toISOString() });
  return space;
}

function deleteSpace(id) {
  const index = state.spaces.findIndex((s) => s.id === id);
  if (index === -1) return false;
  state.spaces.splice(index, 1);
  return true;
}

/* ----------------------------- bookings ----------------------------- */

function createBooking(booking) {
  const record = { id: nextId('booking'), createdAt: new Date().toISOString(), ...booking };
  state.bookings.push(record);
  return record;
}

function listBookings(filter = {}) {
  return state.bookings.filter((b) => {
    if (filter.userId && b.userId !== filter.userId) return false;
    if (filter.spaceId && b.spaceId !== filter.spaceId) return false;
    if (filter.status && b.status !== filter.status) return false;
    return true;
  });
}

function findBookingById(id) {
  return state.bookings.find((b) => b.id === id);
}

function updateBooking(id, changes) {
  const booking = findBookingById(id);
  if (!booking) return undefined;
  Object.assign(booking, changes, { updatedAt: new Date().toISOString() });
  return booking;
}

/* ----------------------------- lifecycle ----------------------------- */

function reset() {
  state.users = [];
  state.spaces = [];
  state.bookings = [];
  state.sequences = { user: 0, space: 0, booking: 0 };
}

function seedSpaces() {
  createSpace({
    name: 'Burwood Library Pod 1',
    campus: 'Burwood',
    capacity: 4,
    hasWhiteboard: true,
    hasMonitor: true,
    active: true
  });
  createSpace({
    name: 'Waurn Ponds Quiet Room A',
    campus: 'Waurn Ponds',
    capacity: 2,
    hasWhiteboard: false,
    hasMonitor: false,
    active: true
  });
  createSpace({
    name: 'Waterfront Group Room 3',
    campus: 'Waterfront',
    capacity: 8,
    hasWhiteboard: true,
    hasMonitor: true,
    active: true
  });
}

function counts() {
  return {
    users: state.users.length,
    spaces: state.spaces.length,
    bookings: state.bookings.length
  };
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  createSpace,
  listSpaces,
  findSpaceById,
  updateSpace,
  deleteSpace,
  createBooking,
  listBookings,
  findBookingById,
  updateBooking,
  reset,
  seedSpaces,
  counts
};
