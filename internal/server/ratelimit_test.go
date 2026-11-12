package server_test

import (
	"net/http"
	"net/netip"
	"testing"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
)

// clock is a settable time for the rate limiter.
type clock struct{ now time.Time }

func (c *clock) Now() time.Time          { return c.now }
func (c *clock) advance(d time.Duration) { c.now = c.now.Add(d) }

func newClock() *clock { return &clock{now: time.Date(2026, 11, 12, 9, 0, 0, 0, time.UTC)} }

// rateLimited makes a router that lets each client share burst times, then
// perHour, on a clock the test moves. It believes forwarding headers from
// the trusted ranges.
func rateLimited(t *testing.T, perHour float64, burst int, trusted ...string) (http.Handler, *clock) {
	t.Helper()
	c := newClock()
	cfg := testConfig(t)
	cfg.Now = c.Now
	cfg.ShareLimit = server.RateLimit{PerHour: perHour, Burst: burst}
	for _, p := range trusted {
		cfg.TrustedProxies = append(cfg.TrustedProxies, netip.MustParsePrefix(p))
	}
	return server.New(cfg), c
}

const aSnapshot = `{"scramble": "R U", "moves": "F"}`

// assertShares checks whether a share request is let through (200) or
// refused (429).
func assertShares(t *testing.T, h http.Handler, want bool, options ...func(*http.Request)) {
	t.Helper()
	res := postSnapshot(t, h, aSnapshot, options...)
	if want && res.StatusCode != http.StatusOK {
		t.Fatalf("status %d, want 200", res.StatusCode)
	}
	if !want && res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status %d, want 429", res.StatusCode)
	}
}

func TestSharingIsRateLimitedPerClient(t *testing.T) {
	h, c := rateLimited(t, 30, 2)
	alice, bob := from("198.51.100.7:4000"), from("198.51.100.8:4000")

	assertShares(t, h, true, alice)
	assertShares(t, h, true, alice)
	res := postSnapshot(t, h, aSnapshot, alice)

	if res.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("third share: status %d, want 429", res.StatusCode)
	}
	// 30 an hour is one every 120 seconds.
	if got := res.Header.Get("Retry-After"); got != "120" {
		t.Errorf("Retry-After %q, want 120", got)
	}
	if e := decode[apiError](t, res); e.Code != "rate-limited" || e.Message == "" {
		t.Errorf("error %+v, want code rate-limited and a message", e)
	}
	// Another client has its own limit, and loading isn't limited.
	assertShares(t, h, true, bob)
	if res := get(t, h, "/api/snapshots/nope"); res.StatusCode != http.StatusNotFound {
		t.Errorf("GET while limited: status %d, want 404", res.StatusCode)
	}

	c.advance(100 * time.Second)
	res = postSnapshot(t, h, aSnapshot, alice)
	if got := res.Header.Get("Retry-After"); res.StatusCode != http.StatusTooManyRequests || got != "20" {
		t.Errorf("100 s later: status %d, Retry-After %q, want 429 and 20", res.StatusCode, got)
	}
	c.advance(20 * time.Second)
	assertShares(t, h, true, alice)
	assertShares(t, h, false, alice)
}

func TestTheShareLimitCountsInvalidRequestsToo(t *testing.T) {
	h, _ := rateLimited(t, 30, 1)

	if res := postSnapshot(t, h, `{"scramble": "M"}`); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", res.StatusCode)
	}
	assertShares(t, h, false)
}

func TestTheDefaultShareLimitIs30AnHourInBurstsOf10(t *testing.T) {
	c := newClock()
	cfg := testConfig(t)
	cfg.Now = c.Now
	h := server.New(cfg)

	for range 10 {
		assertShares(t, h, true)
	}
	res := postSnapshot(t, h, aSnapshot)
	if got := res.Header.Get("Retry-After"); res.StatusCode != http.StatusTooManyRequests || got != "120" {
		t.Errorf("11th share: status %d, Retry-After %q, want 429 and 120", res.StatusCode, got)
	}
	// Twenty minutes refill the whole burst, and no more.
	c.advance(20 * time.Minute)
	for range 10 {
		assertShares(t, h, true)
	}
	assertShares(t, h, false)
}

func TestForwardingHeadersCountOnlyFromTrustedProxies(t *testing.T) {
	t.Run("with no trusted proxies, the connection's address counts", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1)

		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1"))
		assertShares(t, h, false, from("10.0.0.1:5000", "203.0.113.2"))
	})

	t.Run("through a trusted proxy, the forwarded address counts", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "10.0.0.0/8")

		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1"))
		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.2"))
		// The same client through another proxy in the range.
		assertShares(t, h, false, from("10.200.0.9:5000", "203.0.113.1"))
	})

	t.Run("an address a client forged ahead of the proxy's doesn't count", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "10.0.0.0/8")

		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1"))
		assertShares(t, h, false, from("10.0.0.1:5000", "198.51.100.99, 203.0.113.1"))
		assertShares(t, h, false, from("10.0.0.1:5000", "198.51.100.98", "203.0.113.1"))
	})

	t.Run("a chain of trusted proxies is skipped", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "10.0.0.0/8", "192.168.1.1/32")

		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1, 192.168.1.1, 10.0.0.2"))
		assertShares(t, h, false, from("10.0.0.3:5000", "203.0.113.1:60123"))
	})

	t.Run("headers from an untrusted address are ignored", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "10.0.0.0/8")

		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1"))
		assertShares(t, h, true, from("192.0.2.50:5000", "203.0.113.1"))
		assertShares(t, h, false, from("192.0.2.50:5000", "203.0.113.77"))
	})

	t.Run("a malformed forwarded address falls back to the proxy's", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "10.0.0.0/8")

		assertShares(t, h, true, from("10.0.0.1:5000", "not-an-address"))
		assertShares(t, h, false, from("10.0.0.1:5000", "unknown"))
		assertShares(t, h, true, from("10.0.0.1:5000", "203.0.113.1"))
	})

	t.Run("IPv6 clients in one /64 share a limit", func(t *testing.T) {
		h, _ := rateLimited(t, 30, 1, "2001:db8:ffff::/48")

		assertShares(t, h, true, from("[2001:db8:1:2::1]:5000"))
		assertShares(t, h, false, from("[2001:db8:1:2:aaaa::9]:5000"))
		assertShares(t, h, true, from("[2001:db8:1:3::1]:5000"))
		assertShares(t, h, false, from("[2001:db8:ffff::1]:443", "[2001:db8:1:3::2]"))
		// An IPv4 address written as IPv6 is the same client.
		assertShares(t, h, true, from("198.51.100.7:4000"))
		assertShares(t, h, false, from("[::ffff:198.51.100.7]:4000"))
	})
}
