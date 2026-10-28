-- Auth is handled by Casdoor; local password hashes are no longer stored.
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users DROP COLUMN IF EXISTS password;
