import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Uses the WebSocket-based Pool driver (not neon-http) — required because
// several DAL functions (createWorkspace, inviteParticipant, updateParticipant)
// wrap multi-table writes in db.transaction(...), which neon-http doesn't
// support.
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
