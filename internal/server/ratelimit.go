package server

import (
	"net/netip"
	"sync"
	"time"
)

// RateLimit is a token bucket per client: Burst requests at once, then one
// more each time another 1/PerHour of an hour passes.
type RateLimit struct {
	PerHour float64
	Burst   int
}

// DefaultShareLimit lets each client share 10 times at once and 30 times an
// hour after that.
var DefaultShareLimit = RateLimit{PerHour: 30, Burst: 10}

// rateLimiter keeps a token bucket per client, in memory, so each replica
// limits on its own. It tracks each bucket as the time it will be full
// again (the generic cell rate algorithm), which is exact in nanoseconds.
type rateLimiter struct {
	// interval is how long one token takes to come back.
	interval time.Duration
	// tolerance is how far ahead of now a bucket's full time may be while it
	// still holds a token: the time to refill all but one.
	tolerance time.Duration

	mu        sync.Mutex
	fullAt    map[netip.Prefix]time.Time
	lastSweep time.Time
}

func newRateLimiter(limit RateLimit) *rateLimiter {
	interval := time.Duration(float64(time.Hour) / limit.PerHour)
	return &rateLimiter{
		interval:  interval,
		tolerance: interval * time.Duration(limit.Burst-1),
		fullAt:    map[netip.Prefix]time.Time{},
	}
}

// allow takes a token from client's bucket. If the bucket is empty, it
// takes nothing and says how long until a token arrives.
func (l *rateLimiter) allow(client netip.Prefix, now time.Time) (ok bool, retryAfter time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)

	fullAt := l.fullAt[client]
	if fullAt.Before(now) {
		fullAt = now
	}
	if wait := fullAt.Sub(now) - l.tolerance; wait > 0 {
		return false, wait
	}
	l.fullAt[client] = fullAt.Add(l.interval)
	return true, 0
}

// sweep forgets the buckets that are full again, which behave the same as
// new ones, so the map holds only clients seen recently. It looks at most
// once per time an empty bucket takes to fill.
func (l *rateLimiter) sweep(now time.Time) {
	if now.Sub(l.lastSweep) < l.tolerance+l.interval {
		return
	}
	for client, fullAt := range l.fullAt {
		if !fullAt.After(now) {
			delete(l.fullAt, client)
		}
	}
	l.lastSweep = now
}
