package store_test

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot/storetest"
	"github.com/stevemiketa/rubiks-tutor/internal/store"
)

func TestSQLiteStore(t *testing.T) {
	storetest.Run(t, func(t *testing.T) snapshot.Store {
		return open(t, "sqlite:"+filepath.Join(t.TempDir(), "cubular.db"))
	})
}

func open(t *testing.T, databaseURL string) *store.Store {
	t.Helper()
	s, err := store.Open(t.Context(), databaseURL)
	if err != nil {
		t.Fatalf("Open(%q): %v", databaseURL, err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return s
}

func TestSQLiteSnapshotsOutliveTheProcessThatSavedThem(t *testing.T) {
	url := "sqlite:" + filepath.Join(t.TempDir(), "cubular.db")
	s, err := snapshot.Parse("R U F", "M' x")
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.Open(t.Context(), url)
	if err != nil {
		t.Fatal(err)
	}
	id, err := first.Save(t.Context(), s)
	if err != nil {
		t.Fatal(err)
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}

	// Opening again finds the migrations already applied, and the Snapshot.
	saved, err := open(t, url).Load(t.Context(), id)
	if err != nil {
		t.Fatalf("Load after reopening: %v", err)
	}
	if got := string(saved.Snapshot.Body()); got != string(s.Body()) {
		t.Errorf("loaded %s, want %s", got, s.Body())
	}
}

func TestSQLiteStoresStartingTogetherShareOneDatabase(t *testing.T) {
	startTogether(t, "sqlite:"+filepath.Join(t.TempDir(), "cubular.db"))
}

// startTogether opens several stores on one new database at once, as
// replicas starting together do, and checks that they all migrate it and
// then share it.
func startTogether(t *testing.T, url string) {
	t.Helper()
	const n = 6
	stores := make([]*store.Store, n)
	errs := make([]error, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() { stores[i], errs[i] = store.Open(t.Context(), url) })
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("Open %d: %v", i, err)
		}
		t.Cleanup(func() { _ = stores[i].Close() })
	}

	s, err := snapshot.Parse("D L B", "")
	if err != nil {
		t.Fatal(err)
	}
	id, err := stores[0].Save(t.Context(), s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := stores[n-1].Load(t.Context(), id); err != nil {
		t.Errorf("another store can't load the Snapshot: %v", err)
	}
}

func TestDatabaseURLs(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	for _, tc := range []struct {
		url, file string
	}{
		{store.DefaultURL, "cubular.db"},
		{"sqlite:relative.db", "relative.db"},
		{"sqlite://also-relative.db", "also-relative.db"},
		{"sqlite://" + filepath.Join(dir, "absolute.db"), "absolute.db"},
	} {
		t.Run(tc.url, func(t *testing.T) {
			open(t, tc.url)
			if _, err := os.Stat(filepath.Join(dir, tc.file)); err != nil {
				t.Errorf("no database file: %v", err)
			}
		})
	}

	for _, url := range []string{"", "cubular.db", "mysql://localhost/cubular", "sqlite:", "sqlite:cubular.db?mode=ro"} {
		t.Run("rejects "+url, func(t *testing.T) {
			if s, err := store.Open(t.Context(), url); err == nil {
				_ = s.Close()
				t.Errorf("Open(%q) succeeded, want an error", url)
			}
		})
	}
}
