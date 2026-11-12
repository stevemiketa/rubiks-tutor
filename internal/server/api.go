package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

const (
	// maxMoves caps the Moves in one request: Scramble and Move history
	// together.
	maxMoves = 10_000
	// maxBodyBytes caps a request body. maxMoves Moves in notation take at
	// most 3 bytes each ("R2 "), so this leaves room for JSON and whitespace.
	maxBodyBytes = 64 << 10
)

// apiError is an API error response body: a machine-readable code and a
// readable message, plus where the error is for bad notation.
type apiError struct {
	status  int
	Code    string `json:"code"`
	Message string `json:"message"`
	// For "invalid-notation": the field holding the bad notation, the bad
	// token, and the 0-based character offset where it starts.
	Field  string `json:"field,omitempty"`
	Token  string `json:"token,omitempty"`
	Offset *int   `json:"offset,omitempty"`
}

func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.status, e)
}

// movesRequest is a request body that carries a Session's Moves: a Scramble
// and a Move history, each in space-separated notation.
type movesRequest struct {
	Scramble []cube.Move
	Moves    []cube.Move
}

// Cube returns the Cube the request describes: a solved Cube, then the
// Scramble, then the Move history.
func (r movesRequest) Cube() cube.Cube {
	return cube.Solved().Apply(r.Scramble...).Apply(r.Moves...)
}

// decodeMovesRequest reads and checks a movesRequest body: valid JSON, valid
// notation, and no more than maxMoves Moves in a body of at most
// maxBodyBytes.
func decodeMovesRequest(w http.ResponseWriter, r *http.Request) (movesRequest, *apiError) {
	var body struct {
		Scramble string `json:"scramble"`
		Moves    string `json:"moves"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&body); err != nil {
		if errors.As(err, new(*http.MaxBytesError)) {
			return movesRequest{}, &apiError{
				status:  http.StatusRequestEntityTooLarge,
				Code:    "body-too-large",
				Message: fmt.Sprintf("the request body is larger than %d bytes", maxBodyBytes),
			}
		}
		return movesRequest{}, &apiError{
			status:  http.StatusBadRequest,
			Code:    "invalid-request",
			Message: `the request body must be a JSON object with "scramble" and "moves" strings`,
		}
	}

	var req movesRequest
	for _, f := range []struct {
		name     string
		notation string
		moves    *[]cube.Move
	}{{"scramble", body.Scramble, &req.Scramble}, {"moves", body.Moves, &req.Moves}} {
		moves, err := cube.ParseMoves(f.notation)
		if perr := (*cube.ParseError)(nil); errors.As(err, &perr) {
			return movesRequest{}, &apiError{
				status:  http.StatusBadRequest,
				Code:    "invalid-notation",
				Message: fmt.Sprintf("%s: %v", f.name, perr),
				Field:   f.name,
				Token:   perr.Token,
				Offset:  &perr.Offset,
			}
		}
		*f.moves = moves
	}
	if n := len(req.Scramble) + len(req.Moves); n > maxMoves {
		return movesRequest{}, &apiError{
			status:  http.StatusRequestEntityTooLarge,
			Code:    "too-many-moves",
			Message: fmt.Sprintf("the request has %d Moves; the limit is %d", n, maxMoves),
		}
	}
	return req, nil
}
