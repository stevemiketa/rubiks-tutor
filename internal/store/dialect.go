package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver, which needs no cgo
	sqlitedriver "modernc.org/sqlite"  // registers the "sqlite" driver, which needs no cgo
	sqlite3 "modernc.org/sqlite/lib"
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
	// prepare readies a newly opened database for migrating, outside any
	// transaction.
	prepare func(ctx context.Context, db *sql.DB) error
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
	name:    "sqlite",
	driver:  "sqlite",
	rebind:  func(query string) string { return query },
	prepare: useWAL,
	// Every transaction begins IMMEDIATE (see sqliteDSN), taking the
	// database's write lock at once, so the migration transaction is the
	// lock.
	lockMigrations: func(context.Context, *sql.Tx) error { return nil },
}

// sqliteBusyTimeout is how long a SQLite writer waits for another to finish.
const sqliteBusyTimeout = 10 * time.Second

// sqliteDSN is the modernc.org/sqlite data source for a file. The busy
// timeout makes a writer wait its turn instead of failing.
func sqliteDSN(path string) string {
	return path + "?_busy_timeout=" + strconv.FormatInt(sqliteBusyTimeout.Milliseconds(), 10) + "&_txlock=immediate"
}

// useWAL puts a SQLite file in WAL mode, which lets reads go on while a
// Snapshot is written. The file keeps the mode, so every later connection
// uses it. Switching needs the file to itself, and when several processes
// switch a new file at once, SQLite fails all but one with SQLITE_BUSY
// straight away rather than wait out the busy timeout, since waiting could
// deadlock. So it tries again, for as long as the busy timeout.
func useWAL(ctx context.Context, db *sql.DB) error {
	ctx, cancel := context.WithTimeout(ctx, sqliteBusyTimeout)
	defer cancel()
	for {
		_, err := db.ExecContext(ctx, `PRAGMA journal_mode = WAL`)
		var e *sqlitedriver.Error
		if !errors.As(err, &e) || e.Code()&0xff != sqlite3.SQLITE_BUSY {
			return err
		}
		select {
		case <-ctx.Done():
			return err
		case <-time.After(10 * time.Millisecond):
		}
	}
}

var postgres = &dialect{
	name:    "postgres",
	driver:  "pgx",
	rebind:  numberPlaceholders,
	prepare: func(context.Context, *sql.DB) error { return nil },
	// A transaction-level advisory lock is released when the transaction
	// ends, even if the process dies. A process that waited for it then
	// sees the migrations committed before it: each statement of a READ
	// COMMITTED transaction, the default, sees everything committed before
	// the statement began.
	lockMigrations: func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, postgresMigrationLock)
		return err
	},
}

// postgresMigrationLock is the advisory lock key Cubular's migrations take:
// "cubular" in ASCII. Advisory locks are shared by the whole database, so it
// must not be a key anything else using the database takes.
const postgresMigrationLock int64 = 0x63_75_62_75_6c_61_72

// numberPlaceholders rewrites ? placeholders as Postgres's $1, $2 and so on.
// No query of the Store's has a ? anywhere else.
func numberPlaceholders(query string) string {
	var b strings.Builder
	n := 0
	for _, c := range query {
		if c != '?' {
			b.WriteRune(c)
			continue
		}
		n++
		b.WriteString("$" + strconv.Itoa(n))
	}
	return b.String()
}

// parseURL returns the dialect and driver data source a DATABASE_URL names.
// Errors never repeat the URL, which could hold a password.
func parseURL(databaseURL string) (*dialect, string, error) {
	scheme, rest, ok := strings.Cut(databaseURL, ":")
	if !ok {
		return nil, "", errors.New("DATABASE_URL must start with sqlite: or postgres://")
	}
	switch scheme {
	case "sqlite":
		path := strings.TrimPrefix(rest, "//")
		if path == "" {
			return nil, "", errors.New("DATABASE_URL names no SQLite file: use sqlite:<path>")
		}
		// The driver reads everything after a ? as its own parameters.
		if strings.Contains(path, "?") {
			return nil, "", errors.New("DATABASE_URL: a SQLite path can't contain ?")
		}
		return sqlite, sqliteDSN(path), nil
	case "postgres", "postgresql":
		return postgres, databaseURL, nil
	default:
		return nil, "", fmt.Errorf("DATABASE_URL has the unsupported scheme %q: use sqlite: or postgres://", scheme)
	}
}
