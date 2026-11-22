-- SlipFlow Platform Admin Role & Shop/User Status Migration (0003)

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'SELLER';
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

ALTER TABLE shops ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Automatically promote the earliest user (if any already exists) to ADMIN
UPDATE users SET role = 'ADMIN' WHERE id = (SELECT MIN(id) FROM users);
