package store_test

import (
	"strings"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot/storetest"
	"github.com/stevemiketa/rubiks-tutor/internal/store"
	"github.com/stevemiketa/rubiks-tutor/internal/store/pgtest"
)

// The Postgres tests run when CUBULAR_TEST_POSTGRES_URL names a database;
// see package pgtest.

func TestPostgresStore(t *testing.T) {
	url := pgtest.EmptySchema(t)
	storetest.Run(t, func(t *testing.T) snapshot.Store { return open(t, url) })
}

func TestPostgresStoresStartingTogetherShareOneDatabase(t *testing.T) {
	startTogether(t, pgtest.EmptySchema(t))
}

func TestPostgresURLsTakeEitherScheme(t *testing.T) {
	_, rest, _ := strings.Cut(pgtest.EmptySchema(t), "://")
	s, err := snapshot.Parse("R U", "")
	if err != nil {
		t.Fatal(err)
	}
	id, err := open(t, "postgres://"+rest).Save(t.Context(), s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := open(t, "postgresql://"+rest).Load(t.Context(), id); err != nil {
		t.Errorf("a postgresql:// URL doesn't reach the same database: %v", err)
	}
}

func TestInvalidPostgresURLsAreRejectedWithoutTheirPassword(t *testing.T) {
	const password = "hunter2"
	for _, url := range []string{
		"postgres://cubular:" + password + "@db.example:notaport/cubular",
		"postgresql://cubular:" + password + "@db.example/cubular?sslmode=sometimes",
		"postgres://cubular:" + password + "@db.example/cubular?connect_timeout=soon",
	} {
		t.Run(strings.ReplaceAll(url, password, "PASSWORD"), func(t *testing.T) {
			s, err := store.Open(t.Context(), url)
			if err == nil {
				_ = s.Close()
				t.Fatal("Open succeeded, want an error")
			}
			if strings.Contains(err.Error(), password) {
				t.Errorf("the error shows the password: %v", err)
			}
		})
	}
}
