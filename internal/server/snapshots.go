package server

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// snapshotAPI serves POST /api/snapshots, which shares a Snapshot, and
// GET /api/snapshots/{id}, which opens one.
type snapshotAPI struct {
	store   snapshot.Store
	baseURL string
	// trusted are the proxies whose forwarding headers say where a request
	// was sent, for share links when there is no baseURL.
	trusted   []netip.Prefix
	limiter   *rateLimiter
	clientKey func(*http.Request) netip.Prefix
	now       func() time.Time
	logger    *slog.Logger
}

type sharedSnapshot struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type loadedSnapshot struct {
	ID        string    `json:"id"`
	Scramble  string    `json:"scramble"`
	Moves     string    `json:"moves"`
	CreatedAt time.Time `json:"createdAt"`
}

func (api *snapshotAPI) create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	// Every request counts against the limit, valid or not.
	if ok, wait := api.limiter.allow(api.clientKey(r), api.now()); !ok {
		seconds := int64((wait + time.Second - 1) / time.Second)
		w.Header().Set("Retry-After", strconv.FormatInt(seconds, 10))
		writeError(w, &apiError{
			status:  http.StatusTooManyRequests,
			Code:    "rate-limited",
			Message: fmt.Sprintf("too many Snapshots shared from this address; try again in %d seconds", seconds),
		})
		return
	}
	if api.store == nil {
		writeError(w, unavailable)
		return
	}

	req, apiErr := decodeMovesRequest(w, r)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}
	snap, err := snapshot.New(req.Scramble, req.Moves)
	if err != nil {
		writeError(w, invalidSnapshot(err))
		return
	}

	id, err := api.store.Save(r.Context(), snap)
	if err != nil {
		api.logger.ErrorContext(r.Context(), "saving a Snapshot", "err", err)
		writeError(w, internalError)
		return
	}
	writeJSON(w, http.StatusOK, sharedSnapshot{ID: id, URL: api.shareURL(r, id)})
}

// shareURL is the link that opens Snapshot id: under the public base URL,
// or else at the address the request was sent to (see requestOrigin).
func (api *snapshotAPI) shareURL(r *http.Request, id string) string {
	base := strings.TrimSuffix(api.baseURL, "/")
	if base == "" {
		base = requestOrigin(r, api.trusted)
	}
	return base + "/s/" + id
}

// requestOrigin is the scheme and host a request was sent to, such as
// https://cubular.example. From a trusted proxy, that is what the proxy says
// the client used, in X-Forwarded-Proto and X-Forwarded-Host, as the nearest
// proxy set them; from anywhere else, or where those are missing or
// malformed, it is the request's own. Only trusted proxies are believed, as
// for a client's address (see clientAddr), so a client can't make a share
// link point anywhere else.
func requestOrigin(r *http.Request, trusted []netip.Prefix) string {
	scheme, host := "http", r.Host
	if r.TLS != nil {
		scheme = "https"
	}
	if isTrusted(parseHop(r.RemoteAddr), trusted) {
		if p := strings.ToLower(nearestForwarded(r.Header.Values("X-Forwarded-Proto"))); p == "http" || p == "https" {
			scheme = p
		}
		if h := nearestForwarded(r.Header.Values("X-Forwarded-Host")); isHost(h) {
			host = h
		}
	}
	return scheme + "://" + host
}

// nearestForwarded is the last of a forwarding header's comma-separated
// values: the one the nearest proxy set.
func nearestForwarded(values []string) string {
	if len(values) == 0 {
		return ""
	}
	hops := strings.Split(values[len(values)-1], ",")
	return strings.TrimSpace(hops[len(hops)-1])
}

// isHost reports whether s is a host, with an optional port, and nothing
// else: no user info, path, query or fragment.
func isHost(s string) bool {
	u, err := url.Parse("http://" + s)
	return s != "" && err == nil && u.Host == s && u.User == nil && u.Path == "" && u.RawQuery == "" && u.Fragment == ""
}

func (api *snapshotAPI) get(w http.ResponseWriter, r *http.Request) {
	if api.store == nil {
		w.Header().Set("Cache-Control", "no-store")
		writeError(w, unavailable)
		return
	}
	saved, err := api.store.Load(r.Context(), r.PathValue("id"))
	if err != nil {
		// A Snapshot with this ID may be shared later, so don't cache.
		w.Header().Set("Cache-Control", "no-store")
		if errors.Is(err, snapshot.ErrNotFound) {
			writeError(w, &apiError{status: http.StatusNotFound, Code: "not-found", Message: "there's no Snapshot with this ID"})
			return
		}
		api.logger.ErrorContext(r.Context(), "loading a Snapshot", "err", err)
		writeError(w, internalError)
		return
	}
	// Snapshots never change, so the answer can be kept forever.
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	writeJSON(w, http.StatusOK, loadedSnapshot{
		ID:        saved.ID,
		Scramble:  cube.FormatMoves(saved.Snapshot.Scramble()),
		Moves:     cube.FormatMoves(saved.Snapshot.Moves()),
		CreatedAt: saved.CreatedAt,
	})
}

// invalidSnapshot is the API error for Moves that can't be a Snapshot.
func invalidSnapshot(err error) *apiError {
	e := &apiError{status: http.StatusBadRequest, Code: "invalid-snapshot", Message: err.Error()}
	switch {
	case errors.Is(err, snapshot.ErrInvalidScramble):
		e.Code = "invalid-scramble"
	case errors.Is(err, snapshot.ErrTooManyMoves):
		e.status, e.Code = http.StatusRequestEntityTooLarge, "too-many-moves"
	}
	return e
}

var (
	unavailable   = &apiError{status: http.StatusServiceUnavailable, Code: "unavailable", Message: "sharing isn't available right now"}
	internalError = &apiError{status: http.StatusInternalServerError, Code: "internal", Message: "something went wrong on the server"}
)
