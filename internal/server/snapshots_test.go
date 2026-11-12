package server_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
)

// postSnapshot sends POST /api/snapshots with payload, from the address
// httptest gives every request (192.0.2.1) unless an option changes it.
func postSnapshot(t *testing.T, h http.Handler, payload string, options ...func(*http.Request)) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/snapshots", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	for _, option := range options {
		option(req)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Result()
}

// from makes a request arrive from addr, with X-Forwarded-For headers if
// any are given.
func from(addr string, forwardedFor ...string) func(*http.Request) {
	return func(r *http.Request) {
		r.RemoteAddr = addr
		for _, v := range forwardedFor {
			r.Header.Add("X-Forwarded-For", v)
		}
	}
}

func decode[T any](t *testing.T, res *http.Response) T {
	t.Helper()
	if got := res.Header.Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type %q, want application/json", got)
	}
	var v T
	if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
		t.Fatalf("decoding the response: %v", err)
	}
	return v
}

type shared struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type loaded struct {
	ID        string `json:"id"`
	Scramble  string `json:"scramble"`
	Moves     string `json:"moves"`
	CreatedAt string `json:"createdAt"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field"`
	Offset  *int   `json:"offset"`
}

// mustShare shares a Snapshot and returns the response, failing unless it
// succeeded.
func mustShare(t *testing.T, h http.Handler, payload string, options ...func(*http.Request)) shared {
	t.Helper()
	res := postSnapshot(t, h, payload, options...)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/snapshots: status %d, want 200: %s", res.StatusCode, body(t, res))
	}
	return decode[shared](t, res)
}

func TestASharedSnapshotLoadsBackByItsID(t *testing.T) {
	h := newTestServer(t)

	before := time.Now()
	got := mustShare(t, h, `{"scramble": "R U R' U'", "moves": "M E x"}`)

	// The ID is the first 10 characters of the URL-safe base64 SHA-256 of
	// {"version":1,"scramble":"R U R' U'","moves":"M E x"}, worked out
	// with openssl.
	if got.ID != "ZG6IiOeAXz" {
		t.Errorf("id %q, want ZG6IiOeAXz", got.ID)
	}
	if want := "http://example.com/s/ZG6IiOeAXz"; got.URL != want {
		t.Errorf("url %q, want %q", got.URL, want)
	}

	res := get(t, h, "/api/snapshots/ZG6IiOeAXz")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("GET: status %d, want 200", res.StatusCode)
	}
	if got, want := res.Header.Get("Cache-Control"), "public, max-age=31536000, immutable"; got != want {
		t.Errorf("Cache-Control %q, want %q", got, want)
	}
	snap := decode[loaded](t, res)
	if snap.ID != "ZG6IiOeAXz" || snap.Scramble != "R U R' U'" || snap.Moves != "M E x" {
		t.Errorf("loaded %+v, want the shared Snapshot", snap)
	}
	createdAt, err := time.Parse(time.RFC3339Nano, snap.CreatedAt)
	if err != nil {
		t.Fatalf("createdAt %q is not RFC 3339: %v", snap.CreatedAt, err)
	}
	if createdAt.Before(before.Add(-time.Second)) || createdAt.After(time.Now()) {
		t.Errorf("createdAt %v, want about %v", createdAt, before)
	}
}

func TestTheSameSnapshotAlwaysGetsTheSameID(t *testing.T) {
	h := newTestServer(t)

	first := mustShare(t, h, `{"scramble": "R U R' U'", "moves": "M E x"}`)
	respaced := mustShare(t, h, `{"scramble": "  R U\tR'   U' ", "moves": "M\nE x"}`)
	other := mustShare(t, h, `{"scramble": "R U R' U'", "moves": "M E x y"}`)

	if respaced.ID != first.ID {
		t.Errorf("the same Snapshot, spaced differently, got ID %q, want %q", respaced.ID, first.ID)
	}
	if other.ID == first.ID {
		t.Errorf("a different Snapshot got the same ID %q", other.ID)
	}
	// What loads back is in standard notation, separated by single spaces.
	snap := decode[loaded](t, get(t, h, "/api/snapshots/"+first.ID))
	if snap.Scramble != "R U R' U'" || snap.Moves != "M E x" {
		t.Errorf("loaded %+v", snap)
	}
}

func TestShareLinksStartWithThePublicBaseURL(t *testing.T) {
	for _, base := range []string{"https://cubular.example", "https://cubular.example/"} {
		t.Run(base, func(t *testing.T) {
			cfg := testConfig(t)
			cfg.PublicBaseURL = base
			got := mustShare(t, server.New(cfg), `{"scramble": "F", "moves": ""}`)

			if want := "https://cubular.example/s/" + got.ID; got.URL != want {
				t.Errorf("url %q, want %q", got.URL, want)
			}
		})
	}
}

func TestWithoutAPublicBaseURLShareLinksTakeForwardedHeadersOnlyFromTrustedProxies(t *testing.T) {
	forwarded := func(addr, proto, host string) func(*http.Request) {
		return func(r *http.Request) {
			r.RemoteAddr = addr
			r.Header.Set("X-Forwarded-Proto", proto)
			r.Header.Set("X-Forwarded-Host", host)
		}
	}
	for _, tc := range []struct {
		name    string
		options []func(*http.Request)
		want    string
	}{
		{"from a trusted proxy", []func(*http.Request){forwarded("10.1.2.3:4567", "https", "cubular.example")}, "https://cubular.example"},
		{"with a port", []func(*http.Request){forwarded("10.1.2.3:4567", "https", "cubular.example:8443")}, "https://cubular.example:8443"},
		{"the nearest proxy's value", []func(*http.Request){forwarded("10.1.2.3:4567", "http, https", "evil.example, cubular.example")}, "https://cubular.example"},
		{"from an untrusted address", []func(*http.Request){forwarded("192.0.2.9:4567", "https", "evil.example")}, "http://example.com"},
		{"a scheme that isn't http or https", []func(*http.Request){forwarded("10.1.2.3:4567", "javascript", "cubular.example")}, "http://cubular.example"},
		{"a host with a path", []func(*http.Request){forwarded("10.1.2.3:4567", "https", "evil.example/s")}, "https://example.com"},
		{"a host with user info", []func(*http.Request){forwarded("10.1.2.3:4567", "https", "me@evil.example")}, "https://example.com"},
		{"no forwarding headers", []func(*http.Request){from("10.1.2.3:4567")}, "http://example.com"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg := testConfig(t)
			cfg.TrustedProxies = []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
			got := mustShare(t, server.New(cfg), `{"scramble": "F", "moves": ""}`, tc.options...)

			if want := tc.want + "/s/" + got.ID; got.URL != want {
				t.Errorf("url %q, want %q", got.URL, want)
			}
		})
	}
}

func TestThePublicBaseURLWinsOverForwardedHeaders(t *testing.T) {
	cfg := testConfig(t)
	cfg.PublicBaseURL = "https://cubular.example"
	cfg.TrustedProxies = []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}
	got := mustShare(t, server.New(cfg), `{"scramble": "F", "moves": ""}`, func(r *http.Request) {
		r.RemoteAddr = "10.1.2.3:4567"
		r.Header.Set("X-Forwarded-Host", "other.example")
	})

	if want := "https://cubular.example/s/" + got.ID; got.URL != want {
		t.Errorf("url %q, want %q", got.URL, want)
	}
}

func TestStartingWithoutAPublicBaseURLLogsAWarning(t *testing.T) {
	for _, base := range []string{"", "https://cubular.example"} {
		t.Run("PublicBaseURL="+base, func(t *testing.T) {
			var logs bytes.Buffer
			cfg := testConfig(t)
			cfg.PublicBaseURL = base
			cfg.Logger = slog.New(slog.NewJSONHandler(&logs, nil))

			server.New(cfg)

			warned := strings.Contains(logs.String(), `"level":"WARN"`) && strings.Contains(logs.String(), "PUBLIC_BASE_URL")
			if warned != (base == "") {
				t.Errorf("logs %q; want a PUBLIC_BASE_URL warning: %v", logs.String(), base == "")
			}
		})
	}
}

func TestAnUnknownSnapshotIsNotFound(t *testing.T) {
	h := newTestServer(t)
	mustShare(t, h, `{"scramble": "R U R' U'", "moves": "M E x"}`)

	for _, id := range []string{"Ab3_x-9QzK", "ZG6IiOeAX", "ZG6IiOeAXzz", "nope"} {
		t.Run(id, func(t *testing.T) {
			res := get(t, h, "/api/snapshots/"+id)

			if res.StatusCode != http.StatusNotFound {
				t.Fatalf("status %d, want 404", res.StatusCode)
			}
			if got := res.Header.Get("Cache-Control"); got != "no-store" {
				t.Errorf("Cache-Control %q, want no-store", got)
			}
			if e := decode[apiError](t, res); e.Code != "not-found" || e.Message == "" {
				t.Errorf("error %+v, want code not-found and a message", e)
			}
		})
	}
}

func TestInvalidSnapshotsAreRejected(t *testing.T) {
	turns := func(n int) string { return strings.TrimSpace(strings.Repeat("R ", n)) }
	for _, tc := range []struct {
		name   string
		body   string
		status int
		code   string
		field  string
		offset int
	}{
		{name: "not JSON", body: `scramble=R`, status: 400, code: "invalid-request"},
		{name: "not an object", body: `["R", ""]`, status: 400, code: "invalid-request"},
		{name: "no moves", body: `{"scramble": "R"}`, status: 400, code: "invalid-request"},
		{name: "no scramble", body: `{"moves": "R"}`, status: 400, code: "invalid-request"},
		{name: "moves not a string", body: `{"scramble": "R", "moves": ["R"]}`, status: 400, code: "invalid-request"},
		{name: "two objects", body: `{"scramble": "R", "moves": ""} {}`, status: 400, code: "invalid-request"},
		{name: "empty body", body: ``, status: 400, code: "invalid-request"},
		{name: "bad Scramble notation", body: `{"scramble": "R Rw U", "moves": ""}`, status: 400, code: "invalid-notation", field: "scramble", offset: 2},
		{name: "bad Move notation", body: `{"scramble": "R", "moves": "M E2' x"}`, status: 400, code: "invalid-notation", field: "moves", offset: 2},
		{name: "middle Layer in the Scramble", body: `{"scramble": "R M", "moves": ""}`, status: 400, code: "invalid-scramble"},
		{name: "Cube rotation in the Scramble", body: `{"scramble": "x R", "moves": ""}`, status: 400, code: "invalid-scramble"},
		{name: "10,001 Moves", body: `{"scramble": "` + turns(25) + `", "moves": "` + turns(9976) + `"}`, status: 413, code: "too-many-moves"},
		{name: "body over the size limit", body: `{"scramble": "R", "moves": "` + strings.Repeat(" ", 64<<10) + `"}`, status: 413, code: "body-too-large"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := postSnapshot(t, newTestServer(t), tc.body)

			if res.StatusCode != tc.status {
				t.Errorf("status %d, want %d", res.StatusCode, tc.status)
			}
			e := decode[apiError](t, res)
			if e.Code != tc.code || e.Message == "" {
				t.Errorf("error %+v, want code %s and a message", e, tc.code)
			}
			if tc.field != "" {
				if e.Field != tc.field || e.Offset == nil || *e.Offset != tc.offset {
					t.Errorf("error %+v, want field %s at offset %d", e, tc.field, tc.offset)
				}
			}
		})
	}
}

func TestASnapshotHoldsUpTo10000Moves(t *testing.T) {
	h := newTestServer(t)
	moves := strings.TrimSpace(strings.Repeat("M2 ", 10_000-25))
	got := mustShare(t, h, `{"scramble": "`+strings.TrimSpace(strings.Repeat("U2 ", 25))+`", "moves": "`+moves+`"}`)

	if snap := decode[loaded](t, get(t, h, "/api/snapshots/"+got.ID)); snap.Moves != moves {
		t.Errorf("loaded %d characters of Moves, want %d", len(snap.Moves), len(moves))
	}
}
