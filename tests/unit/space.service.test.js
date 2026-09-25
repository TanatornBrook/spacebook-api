'use strict';

const spaceService = require('../../src/services/space.service');
const store = require('../../src/data/store');

beforeEach(() => store.reset());

describe('creating a space', () => {
  test('creates an active space with the supplied details', () => {
    const space = spaceService.create({
      name: 'Library Pod 7',
      campus: 'Waterfront',
      capacity: 6,
      hasWhiteboard: true
    });

    expect(space.id).toBeDefined();
    expect(space.active).toBe(true);
    expect(space.hasMonitor).toBe(false);
  });

  test('rejects a campus that is not on the list', () => {
    expect(() =>
      spaceService.create({ name: 'Pod', campus: 'Mars', capacity: 4 })
    ).toThrow(/Campus must be one of/i);
  });

  test('rejects a capacity outside the allowed range', () => {
    expect(() =>
      spaceService.create({ name: 'Big Hall', campus: 'Burwood', capacity: 50 })
    ).toThrow(/between 1 and 20/i);
  });

  test('rejects a capacity that is not a whole number', () => {
    expect(() =>
      spaceService.create({ name: 'Half Pod', campus: 'Burwood', capacity: 2.5 })
    ).toThrow(/whole number/i);
  });

  test('rejects a name that is too short', () => {
    expect(() => spaceService.create({ name: 'A', campus: 'Burwood', capacity: 4 })).toThrow(
      /at least 3 characters/i
    );
  });
});

describe('listing spaces', () => {
  beforeEach(() => store.seedSpaces());

  test('returns every seeded space by default', () => {
    expect(spaceService.list()).toHaveLength(3);
  });

  test('filters by campus', () => {
    const results = spaceService.list({ campus: 'Burwood' });
    expect(results).toHaveLength(1);
    expect(results[0].campus).toBe('Burwood');
  });

  test('filters by minimum capacity', () => {
    expect(spaceService.list({ minCapacity: '4' })).toHaveLength(2);
  });

  test('rejects a minimum capacity that is not a number', () => {
    expect(() => spaceService.list({ minCapacity: 'lots' })).toThrow(/must be a number/i);
  });
});

describe('updating and deleting', () => {
  test('applies a valid change', () => {
    const space = spaceService.create({ name: 'Pod One', campus: 'Burwood', capacity: 4 });
    const updated = spaceService.update(space.id, { capacity: 8 });
    expect(updated.capacity).toBe(8);
    expect(updated.updatedAt).toBeDefined();
  });

  test('rejects a change that would make the space invalid', () => {
    const space = spaceService.create({ name: 'Pod One', campus: 'Burwood', capacity: 4 });
    expect(() => spaceService.update(space.id, { capacity: 0 })).toThrow(/between 1 and 20/i);
  });

  test('removes a space that exists', () => {
    const space = spaceService.create({ name: 'Pod One', campus: 'Burwood', capacity: 4 });
    expect(spaceService.remove(space.id)).toBe(true);
    expect(spaceService.list()).toHaveLength(0);
  });

  test('reports a clear error for a space that does not exist', () => {
    expect(() => spaceService.getById('space-404')).toThrow(/was not found/i);
  });
});
