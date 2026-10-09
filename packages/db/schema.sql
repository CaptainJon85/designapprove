CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  position integer NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  kind text NOT NULL,
  master boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  password_salt text NOT NULL,
  password_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id text PRIMARY KEY,
  position integer NOT NULL,
  name text NOT NULL,
  tile text NOT NULL DEFAULT '',
  shade text NOT NULL DEFAULT '#B9DEFF',
  on_shade text NOT NULL DEFAULT '#10141A',
  mute text NOT NULL DEFAULT '#1F3152',
  profile_url text NOT NULL DEFAULT '',
  profile_label text NOT NULL DEFAULT '',
  profile_handle text NOT NULL DEFAULT '',
  guide jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS roles (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id text NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (user_id, brand_id)
);

CREATE TABLE IF NOT EXISTS designs (
  id text PRIMARY KEY,
  position integer NOT NULL,
  brand_id text,
  body jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  position integer NOT NULL,
  brand_id text,
  body jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id text PRIMARY KEY,
  position integer NOT NULL,
  body jsonb NOT NULL
);
