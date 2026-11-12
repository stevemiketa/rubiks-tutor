package server_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
	"github.com/stevemiketa/rubiks-tutor/internal/store"
)

// A small stand-in for the built frontend, so these tests don't depend on a
// Vite build. The Playwright journeys cover the real one.
const (
	entryPage   = `<!doctype html><title>Cubular</title><script src="/assets/index-B1x2y3z4.js"></script>`
	hashedAsset = `console.log("cubular")`
)

// newTestServer builds the real router with logs discarded.
func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	return server.New(testConfig(t))
}

func newTestServerLoggingTo(t *testing.T, logger *slog.Logger) http.Handler {
	t.Helper()
	cfg := testConfig(t)
	cfg.Logger = logger
	return server.New(cfg)
}

// testConfig is the router's configuration in tests: the stand-in frontend,
// a real SQLite Snapshot store in a temporary directory, and logs discarded.
func testConfig(t *testing.T) server.Config {
	t.Helper()
	snapshots, err := store.Open(t.Context(), "sqlite:"+filepath.Join(t.TempDir(), "cubular.db"))
	if err != nil {
		t.Fatalf("opening the Snapshot store: %v", err)
	}
	t.Cleanup(func() { _ = snapshots.Close() })
	return server.Config{
		Frontend: fstest.MapFS{
			"index.html":               {Data: []byte(entryPage)},
			"assets/index-B1x2y3z4.js": {Data: []byte(hashedAsset)},
		},
		Logger:    slog.New(slog.DiscardHandler),
		Snapshots: snapshots,
	}
}

func get(t *testing.T, h http.Handler, path string) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec.Result()
}

func body(t *testing.T, res *http.Response) string {
	t.Helper()
	b, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	return string(b)
}

func TestHealthEndpointsReportOK(t *testing.T) {
	for _, path := range []string{"/healthz", "/readyz"} {
		t.Run(path, func(t *testing.T) {
			res := get(t, newTestServer(t), path)

			if res.StatusCode != http.StatusOK {
				t.Fatalf("GET %s: status %d, want 200", path, res.StatusCode)
			}
			if got := res.Header.Get("Content-Type"); got != "application/json" {
				t.Errorf("GET %s: Content-Type %q, want application/json", path, got)
			}
			if got, want := body(t, res), `{"status":"ok"}`+"\n"; got != want {
				t.Errorf("GET %s: body %q, want %q", path, got, want)
			}
		})
	}
}

func TestPageRoutesServeTheEntryPageUncached(t *testing.T) {
	for _, path := range []string{"/", "/app", "/s/Ab3_x-9QzK"} {
		t.Run(path, func(t *testing.T) {
			res := get(t, newTestServer(t), path)

			if res.StatusCode != http.StatusOK {
				t.Fatalf("GET %s: status %d, want 200", path, res.StatusCode)
			}
			if got := res.Header.Get("Content-Type"); got != "text/html; charset=utf-8" {
				t.Errorf("GET %s: Content-Type %q, want text/html; charset=utf-8", path, got)
			}
			if got := res.Header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("GET %s: Cache-Control %q, want no-store", path, got)
			}
			if got := body(t, res); got != entryPage {
				t.Errorf("GET %s: body %q, want the entry page", path, got)
			}
		})
	}
}

func TestHashedAssetsAreServedImmutable(t *testing.T) {
	res := get(t, newTestServer(t), "/assets/index-B1x2y3z4.js")

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status %d, want 200", res.StatusCode)
	}
	if got := res.Header.Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q, want text/javascript; charset=utf-8", got)
	}
	if got, want := res.Header.Get("Cache-Control"), "public, max-age=31536000, immutable"; got != want {
		t.Errorf("Cache-Control %q, want %q", got, want)
	}
	if got := body(t, res); got != hashedAsset {
		t.Errorf("body %q, want %q", got, hashedAsset)
	}
}

func TestEachRequestIsLoggedAsJSON(t *testing.T) {
	var logs bytes.Buffer
	h := newTestServerLoggingTo(t, slog.New(slog.NewJSONHandler(&logs, nil)))

	get(t, h, "/app")
	get(t, h, "/nope")

	var lines []map[string]any
	for line := range strings.Lines(logs.String()) {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line is not JSON: %q", line)
		}
		lines = append(lines, entry)
	}
	if len(lines) != 2 {
		t.Fatalf("got %d log lines, want 2:\n%s", len(lines), logs.String())
	}
	for i, want := range []struct {
		path   string
		status float64
	}{{"/app", 200}, {"/nope", 404}} {
		got := lines[i]
		if got["msg"] != "request" || got["method"] != "GET" || got["path"] != want.path || got["status"] != want.status {
			t.Errorf("log line %d = %v, want msg=request method=GET path=%s status=%v", i, got, want.path, want.status)
		}
		if _, ok := got["duration"]; !ok {
			t.Errorf("log line %d has no duration: %v", i, got)
		}
	}
}

func TestUnknownPathsAreNotFound(t *testing.T) {
	for _, path := range []string{"/nope", "/app/extra", "/s/", "/assets/", "/assets/missing-0000.js"} {
		t.Run(path, func(t *testing.T) {
			res := get(t, newTestServer(t), path)

			if res.StatusCode != http.StatusNotFound {
				t.Errorf("GET %s: status %d, want 404", path, res.StatusCode)
			}
			if got := res.Header.Get("Cache-Control"); got != "" {
				t.Errorf("GET %s: Cache-Control %q, want none", path, got)
			}
		})
	}
}
