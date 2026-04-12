import '@testing-library/jest-dom';

// Mock the DB module — tests should not make real DB calls
vi.mock('@/db', () => ({ db: {} }));

// Mock iron-session
vi.mock('iron-session', () => ({
  getIronSession: vi.fn(),
}));
