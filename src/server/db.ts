import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.env.VITEST ? ':memory:' : resolve(process.env.IKO_DATABASE_PATH ?? '.data/iko-connect.sqlite');
if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
database.exec(`
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    document TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    revision INTEGER NOT NULL DEFAULT 1,
    byte_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS projects_user_updated ON projects(user_id, updated_at DESC);
`);
if (databasePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

database.exec('DELETE FROM sessions WHERE expires_at <= unixepoch() * 1000');

export default database;
