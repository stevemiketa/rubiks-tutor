// Package server is Cubular's HTTP layer: the router that serves the API, the
// health endpoints and the embedded frontend.
package server

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
)

// Config holds everything the router depends on.
type Config struct {
	// Frontend is the built frontend: index.html at its root and hashed
	// files under assets/.
	Frontend fs.FS
	// Logger receives one structured line per request. Nil discards logs.
	Logger *slog.Logger
}

// New returns the router.
func New(cfg Config) http.Handler {
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.DiscardHandler)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	// Readiness gains a database check once there is a database.
	mux.HandleFunc("GET /readyz", handleHealth)

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

// writeJSON writes v as the JSON response body with the given status.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
