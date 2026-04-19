import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectOne = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectOne }),
        innerJoin: () => ({ where: () => ({ limit: selectOne }) }),
      }),
    }),
  },
}));

import {
  assertFolderInWorkspace,
  assertParticipantInWorkspace,
  assertFileInWorkspace,
} from './assertions';

beforeEach(() => { vi.clearAllMocks(); });

describe('assertFolderInWorkspace', () => {
  it('throws when folder is missing', async () => {
    selectOne.mockResolvedValueOnce([]);
    await expect(assertFolderInWorkspace('f1', 'w1')).rejects.toThrow('Not found');
  });

  it('throws when folder belongs to a different workspace', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w2' }]);
    await expect(assertFolderInWorkspace('f1', 'w1')).rejects.toThrow('Forbidden');
  });

  it('resolves when folder belongs to the workspace', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w1' }]);
    await expect(assertFolderInWorkspace('f1', 'w1')).resolves.toBeUndefined();
  });
});

describe('assertParticipantInWorkspace', () => {
  it('rejects when participant not in the workspace', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w-other' }]);
    await expect(assertParticipantInWorkspace('p1', 'w1')).rejects.toThrow('Forbidden');
  });

  it('resolves when participant is in the workspace', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w1' }]);
    await expect(assertParticipantInWorkspace('p1', 'w1')).resolves.toBeUndefined();
  });
});

describe('assertFileInWorkspace', () => {
  it('rejects when file → folder → workspace does not match', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w-other' }]);
    await expect(assertFileInWorkspace('f1', 'w1')).rejects.toThrow('Forbidden');
  });

  it('resolves when file belongs to the workspace', async () => {
    selectOne.mockResolvedValueOnce([{ workspaceId: 'w1' }]);
    await expect(assertFileInWorkspace('f1', 'w1')).resolves.toBeUndefined();
  });
});
