import { describe, it, expect, vi } from 'vitest';

// Wave 0 stubs — these tests must FAIL (RED) until implemented in Plan 01-02.
describe('getFolders()', () => {
  it('returns folders for a workspace ordered by sortOrder', () => {
    // TODO: mock db.select, assert folders returned ordered by sortOrder
    expect(true).toBe(false);
  });
});

describe('createFolder()', () => {
  it('inserts a new folder and returns the created row', () => {
    // TODO: mock db.insert, call createFolder(), assert insertion
    expect(true).toBe(false);
  });
});

describe('renameFolder()', () => {
  it('updates the folder name by id', () => {
    // TODO: mock db.update, call renameFolder(), assert update called with new name
    expect(true).toBe(false);
  });
});

describe('deleteFolder()', () => {
  it('deletes a folder by id', () => {
    // TODO: mock db.delete, call deleteFolder(), assert delete was called
    expect(true).toBe(false);
  });
});
