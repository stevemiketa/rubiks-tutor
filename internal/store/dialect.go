package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	_ "modernc.org/sqlite" // registers the "sqlite" driver, which needs no cgo
)

// dialect is what differs between the databases a Store can use.
type dialect struct {
	// name names the database in errors and its migrations directory,
	// migrations/<name>.
	name string
	// driver is the database/sql driver name.
	driver string
	// rebind rewrites a query's ? placeholders in the driver's own style.
	rebind func(query string) string
	// lockMigrations takes the lock that stops two processes migrating at
	// once. tx holds it until it ends.
	lockMigrations func(ctx context.Context, tx *sql.Tx) error
}

// queries are the Store's queries, in a dialect's placeholder style.
type queries struct {
	insert, body, load string
}

func (d *dialect) queries() queries {
	return queries{
		// Takes id, body and created_at. Inserts nothing if id is taken.
		insert: d.rebind(`INSERT INTO snapshots (id, body, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING`),
		body:   d.rebind(`SELECT body FROM snapshots WHERE id = ?`),
		load:   d.rebind(`SELECT body, created_at FROM snapshots WHERE id = ?`),
	}
}

var sqlite = &dialect{
	name:   "sqlite",
	driver: "sqlite",
	rebind: func(query string) string { return query },
	// Every transaction begins IMMEDIATE (see sqliteDSN), taking the
	// database's write lock at once, so the migration transaction is the
	// lock.
	lockMigrations: func(context.Context, *sql.Tx) error { return nil },
}

// sqliteDSN is the modernc.org/sqlite data source for a file. WAL lets
// reads go on while a Snapshot is written; the busy timeout makes a writer
// wait its turn instead of failing.
func sqliteDSN(path string) string {
	return path + "?_busy_timeout=10000&_journal_mode=WAL&_txlock=immediate"
}

// parseURL returns the dialect and driver data source a DATABASE_URL names.
// Errors never repeat the URL, which could hold a password.
func parseURL(databaseURL string) (*dialect, string, error) {
	scheme, rest, ok := strings.Cut(databaseURL, ":")
	if !ok {
		return nil, "", errors.New("DATABASE_URL must start with sqlite:")
	}
	switch scheme {
	case "sqlite":
		path := strings.TrimPrefix(rest, "//")
		if path == "" {
			return nil, "", errors.New("DATABASE_URL names no SQLite file: use sqlite:<path>")
		}
		if strings.ContainsAny(path, "?#") {
			return nil, "", errors.New("DATABASE_URL: a SQLite path can't contain ? or #")
		}
		return sqlite, sqliteDSN(path), nil
	default:
		return nil, "", fmt.Errorf("DATABASE_URL has the unsupported scheme %q: use sqlite:", scheme)
	}
}
