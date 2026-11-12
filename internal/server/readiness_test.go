package server_test

import (
	"cmp"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
	"github.com/stevemiketa/rubiks-tutor/internal/store/pgtest"
)

func TestReadinessChecksTheSQLiteDatabase(t *testing.T) {
	snapshots := openStore(t, "sqlite:"+filepath.Join(t.TempDir(), "cubular.db"))
	h := server.New(configFor(t, snapshots))
	assertReadiness(t, h, http.StatusOK)

	if err := snapshots.Close(); err != nil {
		t.Fatal(err)
	}
	assertReadiness(t, h, http.StatusServiceUnavailable)
}

func TestReadinessChecksThePostgresDatabase(t *testing.T) {
	databaseURL, link := throughLink(t, pgtest.EmptySchema(t))
	h := server.New(configFor(t, openStore(t, databaseURL)))
	assertReadiness(t, h, http.StatusOK)

	link.cut()
	assertReadiness(t, h, http.StatusServiceUnavailable)

	link.restore()
	assertReadiness(t, h, http.StatusOK)
}

func TestReadinessGivesUpOnAPostgresDatabaseThatDoesNotAnswer(t *testing.T) {
	databaseURL, link := throughLink(t, pgtest.EmptySchema(t))
	h := server.New(configFor(t, openStore(t, databaseURL)))
	assertReadiness(t, h, http.StatusOK)

	link.stall()
	// A probe gives up after a few seconds, so the 503 must come sooner.
	start := time.Now()
	assertReadiness(t, h, http.StatusServiceUnavailable)
	if took := time.Since(start); took > 3*time.Second {
		t.Errorf("GET /readyz took %v, want under 3s", took)
	}
}

func assertReadiness(t *testing.T, h http.Handler, want int) {
	t.Helper()
	// Give up eventually, as a probe would, rather than hang the test.
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/readyz", nil))
	res := rec.Result()
	if res.StatusCode != want {
		t.Fatalf("GET /readyz: status %d, want %d", res.StatusCode, want)
	}
	wantBody := `{"status":"ok"}` + "\n"
	if want != http.StatusOK {
		wantBody = `{"status":"unavailable"}` + "\n"
	}
	if got := body(t, res); got != wantBody {
		t.Errorf("GET /readyz: body %q, want %q", got, wantBody)
	}
}

// throughLink returns databaseURL changed to reach its database through a
// link the test can cut or stall, as a network failure would.
func throughLink(t *testing.T, databaseURL string) (string, *link) {
	t.Helper()
	u, err := url.Parse(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	target := u.Host
	if u.Port() == "" {
		target = net.JoinHostPort(cmp.Or(u.Hostname(), "localhost"), "5432")
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	l := &link{target: target, conns: map[net.Conn]bool{}}
	go l.serve(ln)
	t.Cleanup(func() {
		_ = ln.Close()
		l.cut()
	})
	u.Host = ln.Addr().String()
	return u.String(), l
}

// A link forwards TCP connections to target. While it is cut, it drops
// every connection; while it is stalled, it holds new ones open but never
// answers, as a network that loses packets does.
type link struct {
	target string

	mu    sync.Mutex
	state linkState
	conns map[net.Conn]bool
}

type linkState int

const (
	linkUp linkState = iota
	linkCut
	linkStalled
)

func (l *link) serve(ln net.Listener) {
	for {
		client, err := ln.Accept()
		if err != nil {
			return
		}
		go l.forward(client)
	}
}

func (l *link) forward(client net.Conn) {
	defer client.Close()
	if !l.track(client) {
		return
	}
	server, err := net.Dial("tcp", l.target)
	if err != nil {
		return
	}
	defer server.Close()
	if !l.track(server) {
		return
	}
	go func() {
		l.pipe(server, client)
		_ = server.Close()
	}()
	l.pipe(client, server)
}

// pipe copies src to dst, losing whatever arrives while the link is stalled.
func (l *link) pipe(dst, src net.Conn) {
	buf := make([]byte, 32<<10)
	for {
		n, err := src.Read(buf)
		if n > 0 && l.is(linkUp) {
			if _, err := dst.Write(buf[:n]); err != nil {
				return
			}
		}
		if err != nil {
			return
		}
	}
}

// track keeps c to drop when the link is cut, or reports false if it is.
func (l *link) track(c net.Conn) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.state == linkCut {
		return false
	}
	l.conns[c] = true
	return true
}

func (l *link) is(state linkState) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.state == state
}

// cut drops every connection and refuses new ones.
func (l *link) cut() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.state = linkCut
	for c := range l.conns {
		_ = c.Close()
	}
	clear(l.conns)
}

func (l *link) stall() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.state = linkStalled
}

func (l *link) restore() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.state = linkUp
}
