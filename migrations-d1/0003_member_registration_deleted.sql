-- Preserve member IDs for rental/admin history while removing registration/profile data.
ALTER TABLE members ADD COLUMN registration_deleted_at TEXT;
