-- One row per Snapshot, written once and never changed or deleted, so share
-- links never break (ADR 0003). body is the canonical serialization whose
-- hash the ID is made from.
CREATE TABLE snapshots (
    id         TEXT PRIMARY KEY,
    body       TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
) WITHOUT ROWID;
