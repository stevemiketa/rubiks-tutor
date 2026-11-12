package server

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// snapshotAPI serves POST /api/snapshots, which shares a Snapshot, and
// GET /api/snapshots/{id}, which opens one.
type snapshotAPI struct {
	store     snapshot.Store
	baseURL   string
	limiter   *rateLimiter
	clientKey func(*http.Request) netip.Prefix
	now       func() time.Time
	logger    *slog.Logger
}

// snapshotRequest is the body of POST /api/snapshots. Both fields are
// required, as standard notation.
type snapshotRequest struct {
	Scramble *string `json:"scramble"`
	Moves    *string `json:"moves"`
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
			Message: fmt.Sprintf("Too many Snapshots shared from your address. Try again in %s.", roughly(wait)),
		})
		return
	}
	if api.store == nil {
		writeError(w, unavailable)
		return
	}

	var req snapshotRequest
	if e := readJSON(w, r, &req); e != nil {
		writeError(w, e)
		return
	}
	if req.Scramble == nil || req.Moves == nil {
		writeError(w, invalidRequest(`The body needs "scramble" and "moves", each a string of Moves in standard notation.`))
		return
	}
	snap, err := snapshot.Parse(*req.Scramble, *req.Moves)
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

// shareURL is the link that opens Snapshot id.
func (api *snapshotAPI) shareURL(r *http.Request, id string) string {
	base := strings.TrimSuffix(api.baseURL, "/")
	if base == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		base = scheme + "://" + r.Host
	}
	return base + "/s/" + id
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
			writeError(w, &apiError{status: http.StatusNotFound, Code: "not-found", Message: "There's no Snapshot with this ID."})
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

// invalidSnapshot is the API error for a Snapshot that failed validation.
func invalidSnapshot(err error) *apiError {
	if notation, ok := errors.AsType[*snapshot.NotationError](err); ok {
		return &apiError{
			status:  http.StatusBadRequest,
			Code:    "invalid-notation",
			Message: fmt.Sprintf("%q in %s isn't a Move in standard notation.", notation.Err.Token, notation.Field),
			Field:   notation.Field,
			Offset:  &notation.Err.Offset,
		}
	}
	e := &apiError{status: http.StatusBadRequest, Code: "invalid-snapshot", Message: err.Error() + "."}
	switch {
	case errors.Is(err, snapshot.ErrInvalidScramble):
		e.Code = "invalid-scramble"
	case errors.Is(err, snapshot.ErrTooManyMoves):
		e.status, e.Code = http.StatusRequestEntityTooLarge, "too-many-moves"
	}
	return e
}

var (
	unavailable   = &apiError{status: http.StatusServiceUnavailable, Code: "unavailable", Message: "Sharing isn't available right now."}
	internalError = &apiError{status: http.StatusInternalServerError, Code: "internal", Message: "Something went wrong on the server."}
)

// roughly says how long a wait is, for a person: "2 minutes", "45 seconds".
func roughly(d time.Duration) string {
	if d > 90*time.Second {
		return fmt.Sprintf("%d minutes", (d+time.Minute-1)/time.Minute)
	}
	s := (d + time.Second - 1) / time.Second
	if s == 1 {
		return "1 second"
	}
	return fmt.Sprintf("%d seconds", s)
}
