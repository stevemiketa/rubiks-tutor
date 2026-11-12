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
	"strings"
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
	// sent to, as a trusted proxy's X-Forwarded-Proto and X-Forwarded-Host
	// report it, and New logs a warning, since that suits only local
	// development.
	PublicBaseURL string
	// ShareLimit is how often one client may share. Fields left at zero
	// take DefaultShareLimit's values.
	ShareLimit RateLimit
	// TrustedProxies are the address ranges whose forwarding headers are
	// believed: X-Forwarded-For when working out a client's address, and
	// X-Forwarded-Proto and X-Forwarded-Host for share links without a
	// PublicBaseURL. Requests from anywhere else are taken to come from
	// their connection's address, to the address they were sent to.
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

	if cfg.PublicBaseURL == "" {
		cfg.Logger.Warn("PUBLIC_BASE_URL is not set, so share links point to the address each request was sent to: " +
			"set it in production, or behind a proxy set TRUSTED_PROXIES so its X-Forwarded-Proto and X-Forwarded-Host are believed")
	}
	snapshots := &snapshotAPI{
		store:     cfg.Snapshots,
		baseURL:   cfg.PublicBaseURL,
		trusted:   cfg.TrustedProxies,
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
	return logRequests(cfg.Logger, apiErrors(mux))
}

// apiErrors answers an /api/ request that no route takes with the API's
// JSON error body: 404 for a path the API doesn't have, and 405, with the
// Allow header, for a method its route doesn't take. Every other request,
// including unknown page paths, which keep the plain 404, goes to mux as it
// is.
func apiErrors(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if pattern != "" || !strings.HasPrefix(r.URL.Path, "/api/") {
			mux.ServeHTTP(w, r)
			return
		}
		// With no pattern, the mux would answer 404 or 405 itself, or
		// redirect to a cleaned path. See which, without its plain-text body.
		probe := &statusProbe{header: http.Header{}}
		h.ServeHTTP(probe, r)
		if probe.status == http.StatusNotFound || probe.status == http.StatusMethodNotAllowed {
			// A later version may answer here, so don't cache.
			w.Header().Set("Cache-Control", "no-store")
		}
		switch probe.status {
		case http.StatusNotFound:
			writeError(w, &apiError{status: http.StatusNotFound, Code: "not-found", Message: "the API has no " + r.URL.Path})
		case http.StatusMethodNotAllowed:
			w.Header().Set("Allow", probe.header.Get("Allow"))
			writeError(w, &apiError{
				status:  http.StatusMethodNotAllowed,
				Code:    "method-not-allowed",
				Message: fmt.Sprintf("%s doesn't take %s; it takes %s", r.URL.Path, r.Method, probe.header.Get("Allow")),
			})
		default:
			h.ServeHTTP(w, r)
		}
	})
}

// statusProbe is a ResponseWriter that keeps only the status and the
// headers it is given.
type statusProbe struct {
	header http.Header
	status int
}

func (p *statusProbe) Header() http.Header { return p.header }

func (p *statusProbe) WriteHeader(status int) {
	if p.status == 0 {
		p.status = status
	}
}

func (p *statusProbe) Write(b []byte) (int, error) {
	p.WriteHeader(http.StatusOK)
	return len(b), nil
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
