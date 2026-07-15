CREATE TABLE entries (
  project_slug         TEXT NOT NULL,
  id                   TEXT NOT NULL,
  content              TEXT NOT NULL,
  tags                 TEXT NOT NULL DEFAULT '[]',
  source               TEXT NOT NULL DEFAULT 'api',
  source_type          TEXT NOT NULL,
  source_uri           TEXT NOT NULL,
  task_id              TEXT,
  repository           TEXT NOT NULL,
  repo_commit          TEXT,
  created_by_agent     TEXT NOT NULL,
  verified_by          TEXT,
  verified_at          INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  content_hash         TEXT NOT NULL,
  valid_from           INTEGER,
  valid_until          INTEGER,
  status               TEXT NOT NULL DEFAULT 'draft',
  vector_ids           TEXT NOT NULL DEFAULT '[]',
  recall_count         INTEGER NOT NULL DEFAULT 0,
  importance_score     INTEGER NOT NULL DEFAULT 0,
  contradiction_wins   INTEGER NOT NULL DEFAULT 0,
  contradiction_losses INTEGER NOT NULL DEFAULT 0,
  CHECK (
    status != 'canonical'
    OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  PRIMARY KEY (project_slug, id)
);

CREATE INDEX idx_entries_project_created
  ON entries(project_slug, created_at DESC);
CREATE INDEX idx_entries_project_source_type
  ON entries(project_slug, source_type);
CREATE INDEX idx_entries_project_content_hash
  ON entries(project_slug, content_hash);
CREATE INDEX idx_entries_project_validity
  ON entries(project_slug, valid_until, created_at DESC);

CREATE TABLE edges (
  project_slug TEXT NOT NULL,
  id           TEXT NOT NULL,
  source_id    TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'relates_to',
  weight       REAL NOT NULL DEFAULT 0.5,
  provenance   TEXT NOT NULL DEFAULT 'inferred',
  metadata     TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (project_slug, id),
  UNIQUE (project_slug, source_id, target_id, type),
  FOREIGN KEY (project_slug, source_id)
    REFERENCES entries(project_slug, id),
  FOREIGN KEY (project_slug, target_id)
    REFERENCES entries(project_slug, id)
);

CREATE INDEX idx_edges_project_source
  ON edges(project_slug, source_id);
CREATE INDEX idx_edges_project_target
  ON edges(project_slug, target_id);

CREATE TABLE audit_events (
  id             TEXT PRIMARY KEY,
  timestamp      INTEGER NOT NULL,
  principal_id   TEXT NOT NULL,
  project_slug   TEXT NOT NULL,
  operation      TEXT NOT NULL,
  outcome        TEXT NOT NULL,
  latency_ms     INTEGER NOT NULL,
  result_count   INTEGER NOT NULL DEFAULT 0,
  metering       TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_audit_project_time
  ON audit_events(project_slug, timestamp DESC);
