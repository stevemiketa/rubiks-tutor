// Package pgtest gives tests the Postgres database named by
// CUBULAR_TEST_POSTGRES_URL. Without one, tests that need Postgres skip,
// except in CI, where they fail, so the Postgres tests can't stop running
// unnoticed.
package pgtest

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand/v2"
	"net/url"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver
)

// EnvVar names the environment variable holding the Postgres URL tests may
// use, such as postgres://postgres:cubular@localhost:5432/postgres?sslmode=disable.
const EnvVar = "CUBULAR_TEST_POSTGRES_URL"

// URL returns the Postgres URL in [EnvVar], or skips t if it is unset.
func URL(t testing.TB) string {
	t.Helper()
	databaseURL := os.Getenv(EnvVar)
	if databaseURL == "" {
		if os.Getenv("CI") != "" {
			t.Fatalf("%s is unset: CI must run the Postgres tests", EnvVar)
		}
		t.Skipf("set %s to a Postgres URL to run this test", EnvVar)
	}
	return databaseURL
}

// EmptySchema returns [URL] changed so that everything a Store creates goes
// in a new, empty schema of that database. Tests using it see migrations
// run from the start and leave nothing behind: the schema is dropped when t
// ends, after any cleanup registered later.
func EmptySchema(t testing.TB) string {
	t.Helper()
	base := URL(t)
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("%s is not a URL", EnvVar)
	}

	db, err := sql.Open("pgx", base)
	if err != nil {
		t.Fatalf("opening the Postgres database: %v", err)
	}
	schema := fmt.Sprintf("cubular_test_%016x", rand.Uint64())
	if _, err := db.ExecContext(t.Context(), "CREATE SCHEMA "+schema); err != nil {
		_ = db.Close()
		t.Fatalf("creating a schema: %v", err)
	}
	t.Cleanup(func() {
		defer db.Close()
		if _, err := db.ExecContext(context.Background(), "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("dropping schema %s: %v", schema, err)
		}
	})

	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	return u.String()
}
