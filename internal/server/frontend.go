package server

import (
	"io/fs"
	"log/slog"
	"net/http"
)

// entryPageHandler serves the frontend's index.html for a page route. The
// browser router then picks the page to show. The entry page names the
// current hashed assets, so it must never be cached.
func entryPageHandler(frontend fs.FS, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page, err := fs.ReadFile(frontend, "index.html")
		if err != nil {
			logger.ErrorContext(r.Context(), "reading entry page", "err", err)
			http.Error(w, "frontend unavailable", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(page)
	}
}

// assetHandler serves a file from the frontend's assets/ directory. Vite puts
// a content hash in every name there, so a URL's content never changes and
// browsers may cache it forever.
func assetHandler(frontend fs.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		name := "assets/" + r.PathValue("path")
		if info, err := fs.Stat(frontend, name); err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		http.ServeFileFS(w, r, frontend, name)
	}
}
