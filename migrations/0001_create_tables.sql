-- Migration 0001: creates the two tables.
-- A migration is a saved set of database changes. Running it creates the tables
-- the first time, and does nothing if they already exist.

-- One row per tender or pipeline notice we have kept.
CREATE TABLE IF NOT EXISTS notices (
  id                   TEXT PRIMARY KEY,        -- unique: the notice's ID from its service
  source               TEXT NOT NULL,           -- "find-tender" or "contracts-finder"
  ocid                 TEXT,
  title                TEXT NOT NULL,
  description          TEXT,
  buyer                TEXT,
  value                REAL,                    -- value before tax (GBP), or empty if not stated
  currency             TEXT,
  deadline             TEXT,
  stage                TEXT NOT NULL,           -- "tender", "pipeline", or the raw stage name
  cpv_codes            TEXT NOT NULL,           -- a list of CPV codes, stored as JSON text
  procurement_category TEXT,                    -- "services", "goods", "works", or empty
  region               TEXT,
  url                  TEXT,
  published_date       TEXT,
  first_seen_at        TEXT NOT NULL,           -- when our tool first saved this notice
  score                INTEGER,                 -- AI fit score 1 to 10 (empty until step 6)
  reason               TEXT,                    -- AI reason (empty until step 6)
  low_priority         INTEGER NOT NULL DEFAULT 0  -- 1 if the value is under £5m, otherwise 0
);

-- One row per run of the tool, so we can see what each run did.
CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT NOT NULL,                    -- when the run started
  fetched     INTEGER NOT NULL,                 -- how many raw notices came from both services
  new         INTEGER NOT NULL,                 -- how many were not seen before and were saved
  kept        INTEGER NOT NULL,                 -- how many were kept after the filters
  scored      INTEGER NOT NULL DEFAULT 0,       -- how many were scored by AI (0 until step 6)
  errors      TEXT                              -- the error message, or empty if the run worked
);
