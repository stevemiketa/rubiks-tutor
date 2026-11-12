package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"path"
	"strconv"
	"strings"
	"time"
)

// migrations holds each dialect's schema changes as migrations/<dialect
// name>/NNNN_description.sql. They are applied in NNNN order, once each, and
// never edited after they ship: a change to the schema is a new file.
//
//go:embed migrations
var migrations embed.FS

// migrate applies the migrations the database hasn't had yet, in one
// transaction that holds the dialect's migration lock. Processes starting
// at once therefore take turns, and each migration is applied once.
func migrate(ctx context.Context, db *sql.DB, d *dialect) error {
	files, err := fs.Glob(migrations, path.Join("migrations", d.name, "*.sql"))
	if err != nil {
		return err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := d.lockMigrations(ctx, tx); err != nil {
		return fmt.Errorf("taking the migration lock: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INTEGER PRIMARY KEY,
		applied_at TIMESTAMP NOT NULL
	)`); err != nil {
		return err
	}
	applied, err := appliedVersions(ctx, tx)
	if err != nil {
		return err
	}

	for _, file := range files { // fs.Glob sorts them, so NNNN order
		version, err := migrationVersion(file)
		if err != nil {
			return err
		}
		if applied[version] {
			continue
		}
		script, err := fs.ReadFile(migrations, file)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(script)); err != nil {
			return fmt.Errorf("%s: %w", path.Base(file), err)
		}
		record := d.rebind(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`)
		if _, err := tx.ExecContext(ctx, record, version, time.Now().UTC()); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func appliedVersions(ctx context.Context, tx *sql.Tx) (map[int]bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	applied := map[int]bool{}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		applied[v] = true
	}
	return applied, rows.Err()
}

// migrationVersion is the NNNN in migrations/<dialect>/NNNN_description.sql.
func migrationVersion(file string) (int, error) {
	digits, _, _ := strings.Cut(path.Base(file), "_")
	v, err := strconv.Atoi(digits)
	if err != nil || len(digits) != 4 {
		return 0, fmt.Errorf("migration %s: name must start with a 4-digit version and _", file)
	}
	return v, nil
}
