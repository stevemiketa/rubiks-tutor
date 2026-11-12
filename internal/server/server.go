// Package server is Cubular's HTTP layer: the router that serves the API, the
// health endpoints and the embedded frontend.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/netip"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// Config holds everything the router depends on.
type Config struct {
	// Frontend is the built frontend: index.html at its root and hashed
	// files under assets/.
	Frontend fs.FS
	// Logger receives one structured line per request. Nil discards logs.
	Logger *slog.Logger
	// Snapshots keeps shared Snapshots. The Snapshot API answers 503
	// without it.
	Snapshots snapshot.Store
	// Ready checks that what the server depends on, such as the Snapshot
	// database, can be reached. GET /readyz answers 503 while it returns
	// an error. Nil means always ready.
	Ready func(context.Context) error
	// PublicBaseURL is where share links point, such as
	// https://cubular.example. Empty means the address each request was
	// sent to.
	PublicBaseURL string
	// ShareLimit is how often one client may share. Fields left at zero
	// take DefaultShareLimit's values.
	ShareLimit RateLimit
	// TrustedProxies are the address ranges whose X-Forwarded-For headers
	// are believed when working out a client's address. Requests from
	// anywhere else are taken to come from their connection's address.
	TrustedProxies []netip.Prefix
	// Now tells the time for rate limiting. Nil means time.Now.
	Now func() time.Time
}

// New returns the router.
func New(cfg Config) http.Handler {
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.ShareLimit.PerHour <= 0 {
		cfg.ShareLimit.PerHour = DefaultShareLimit.PerHour
	}
	if cfg.ShareLimit.Burst < 1 {
		cfg.ShareLimit.Burst = DefaultShareLimit.Burst
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("GET /readyz", readinessHandler(cfg.Ready, cfg.Logger))
	mux.HandleFunc("POST /api/solve", handleSolve)

	snapshots := &snapshotAPI{
		store:     cfg.Snapshots,
		baseURL:   cfg.PublicBaseURL,
		limiter:   newRateLimiter(cfg.ShareLimit),
		clientKey: func(r *http.Request) netip.Prefix { return rateLimitKey(clientAddr(r, cfg.TrustedProxies)) },
		now:       cfg.Now,
		logger:    cfg.Logger,
	}
	mux.HandleFunc("POST /api/snapshots", snapshots.create)
	mux.HandleFunc("GET /api/snapshots/{id}", snapshots.get)

	entryPage := entryPageHandler(cfg.Frontend, cfg.Logger)
	mux.Handle("GET /{$}", entryPage)
	mux.Handle("GET /app", entryPage)
	mux.Handle("GET /s/{id}", entryPage)
	mux.Handle("GET /assets/{path...}", assetHandler(cfg.Frontend))
	return logRequests(cfg.Logger, mux)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readinessTimeout is how long GET /readyz waits for the readiness check
// before answering 503. A probe should wait longer than this, so that it
// hears the answer.
const readinessTimeout = time.Second

// readinessHandler serves GET /readyz: 200 while ready succeeds, otherwise
// 503, with the reason logged rather than shown.
func readinessHandler(ready func(context.Context) error, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready != nil {
			ctx, cancel := context.WithTimeout(r.Context(), readinessTimeout)
			defer cancel()
			if err := ready(ctx); err != nil {
				// Drivers can report running out of time as a bad
				// connection, so say what happened.
				if errors.Is(ctx.Err(), context.DeadlineExceeded) {
					err = fmt.Errorf("no answer within %v: %w", readinessTimeout, err)
				}
				logger.WarnContext(r.Context(), "not ready", "err", err)
				writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
				return
			}
		}
		handleHealth(w, r)
	}
}

// writeJSON writes v as the JSON response body with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
