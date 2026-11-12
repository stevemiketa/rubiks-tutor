-- One row per Snapshot, written once and never changed or deleted, so share
-- links never break (ADR 0003). body is the canonical serialization whose
-- hash the ID is made from. IDs compare byte by byte (COLLATE "C"), so the
-- primary key's index never depends on the operating system's collation
-- rules, which can change under it.
CREATE TABLE snapshots (
    id         TEXT COLLATE "C" PRIMARY KEY,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
