# Snapshots use SQLite locally and Postgres in production

Snapshot storage sits behind one `SnapshotStore` interface with two implementations. SQLite is for local development, so the app runs with no outside services. Postgres is for production, so the app can run more than one replica and can move to Cloud SQL if Cubular moves to GCP. Snapshots are written once and never updated, so the schema stays small enough to work the same in both databases.

## Consequences

The two implementations can behave differently in small ways, such as how each reports a duplicate ID, so both must pass the same store test suite.
