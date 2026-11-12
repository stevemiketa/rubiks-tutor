// Package store keeps Snapshots in a SQL database (ADR 0004). DATABASE_URL
// picks the database: a SQLite file by default, so a local run needs no
// outside services.
//
// Each database has a dialect (dialect.go) and its own migrations, in
// migrations/<dialect name>, which Open applies. Every dialect runs the same
// Store code and must pass the suite in internal/snapshot/storetest.
package store

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// DefaultURL is the database to use when DATABASE_URL is unset: a SQLite
// file in the working directory.
const DefaultURL = "sqlite:cubular.db"

// Store is a [snapshot.Store] over a SQL database. It is safe for
// concurrent use, including by several processes sharing one database.
type Store struct {
	db      *sql.DB
	queries queries
}

// Open connects to the database databaseURL names, applies any migrations
// it hasn't had yet, and returns a Store over it. The forms of databaseURL
// are:
//
//	sqlite:<path>   a SQLite file, created if missing; <path> is relative
//	                to the working directory unless it starts with /, as in
//	                sqlite:///var/lib/cubular/cubular.db (sqlite://<path>
//	                is the same as sqlite:<path>)
func Open(ctx context.Context, databaseURL string) (*Store, error) {
	d, dsn, err := parseURL(databaseURL)
	if err != nil {
		return nil, err
	}
	db, err := sql.Open(d.driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("opening the %s database: %w", d.name, err)
	}
	if err := migrate(ctx, db, d); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrating the %s database: %w", d.name, err)
	}
	return &Store{db: db, queries: d.queries()}, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// Save stores a Snapshot under the first of its IDs that is free or already
// holds it, and returns that ID.
func (s *Store) Save(ctx context.Context, snap snapshot.Snapshot) (string, error) {
	body := snap.Body()
	for id := range snapshot.IDs(body) {
		stored, err := s.insert(ctx, id, body)
		if err != nil {
			return "", fmt.Errorf("saving Snapshot %s: %w", id, err)
		}
		if bytes.Equal(stored, body) {
			return id, nil
		}
	}
	// Only a collision of the whole SHA-256 could get here.
	return "", errors.New("saving a Snapshot: every ID it could have is taken")
}

// insert stores body under id unless id is taken, and returns the body
// stored under id. Rows are never changed or deleted, so what it returns
// stays true.
func (s *Store) insert(ctx context.Context, id string, body []byte) ([]byte, error) {
	now := time.Now().UTC().Truncate(time.Microsecond)
	res, err := s.db.ExecContext(ctx, s.queries.insert, id, string(body), now)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err == nil && n == 1 {
		return body, nil
	}
	var stored string
	if err := s.db.QueryRowContext(ctx, s.queries.body, id).Scan(&stored); err != nil {
		return nil, err
	}
	return []byte(stored), nil
}

// Load returns the Snapshot stored under id.
func (s *Store) Load(ctx context.Context, id string) (snapshot.Saved, error) {
	var (
		body      string
		createdAt time.Time
	)
	err := s.db.QueryRowContext(ctx, s.queries.load, id).Scan(&body, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return snapshot.Saved{}, fmt.Errorf("loading Snapshot %q: %w", id, snapshot.ErrNotFound)
	}
	if err != nil {
		return snapshot.Saved{}, fmt.Errorf("loading Snapshot %q: %w", id, err)
	}
	snap, err := snapshot.FromBody([]byte(body))
	if err != nil {
		return snapshot.Saved{}, fmt.Errorf("loading Snapshot %q: %w", id, err)
	}
	return snapshot.Saved{ID: id, Snapshot: snap, CreatedAt: createdAt.UTC()}, nil
}
