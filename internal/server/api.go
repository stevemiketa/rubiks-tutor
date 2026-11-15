package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

const (
	// maxMoves caps the Moves in one request, Scramble and Move history
	// together, at what a Snapshot holds: any Session that can be solved
	// can be shared, and the other way round.
	maxMoves = snapshot.MaxMoves
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
// and a Move history, each in space-separated notation, and the Puzzle the
// Session is for.
type movesRequest struct {
	Scramble []cube.Move
	Moves    []cube.Move
	Puzzle   cube.Puzzle
}

// Cube returns the Cube the request describes: a solved Cube, then the
// Scramble, then the Move history. A Pocket Cube splits per Move: a whole-Cube
// rotation (x/y/z) is rigid, applied with full Apply so it moves the phantom
// centers and edges together with the corners and a solved 2x2 stays solved in
// any orientation; a face Turn is corner-only (ApplyPocket), so its phantom
// edges and centers stay frozen (ADR 0005).
func (r movesRequest) Cube() cube.Cube {
	if r.Puzzle == cube.Pocket {
		return applyPocketMoves(applyPocketMoves(cube.Solved(), r.Scramble), r.Moves)
	}
	return cube.Solved().Apply(r.Scramble...).Apply(r.Moves...)
}

// applyPocketMoves applies Moves to a Pocket Cube the rigid way: rotations
// move the whole Cube (Apply), face Turns move only the corners (ApplyPocket).
func applyPocketMoves(c cube.Cube, moves []cube.Move) cube.Cube {
	for _, m := range moves {
		if m.IsRotation() {
			c = c.Apply(m)
		} else {
			c = c.ApplyPocket(m)
		}
	}
	return c
}

// decodeMovesRequest reads and checks a movesRequest body: one JSON object
// with the scramble and moves fields, an optional "type" that names a Puzzle
// (a missing type is the Cube), valid notation, and no more than maxMoves Moves
// in a body of at most maxBodyBytes.
func decodeMovesRequest(w http.ResponseWriter, r *http.Request) (movesRequest, *apiError) {
	var body struct {
		Scramble *string `json:"scramble"`
		Moves    *string `json:"moves"`
		Type     *string `json:"type"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	err := dec.Decode(&body)
	if err == nil {
		// Anything after the object, even another object, makes it invalid.
		if extra := dec.Decode(&json.RawMessage{}); extra != io.EOF {
			err = errors.Join(errors.New("more than one JSON value"), extra)
		}
	}
	if errors.As(err, new(*http.MaxBytesError)) {
		return movesRequest{}, &apiError{
			status:  http.StatusRequestEntityTooLarge,
			Code:    "body-too-large",
			Message: fmt.Sprintf("the request body is larger than %d bytes", maxBodyBytes),
		}
	}
	if err != nil || body.Scramble == nil || body.Moves == nil {
		return movesRequest{}, &apiError{
			status:  http.StatusBadRequest,
			Code:    "invalid-request",
			Message: `the request body must be a JSON object with "scramble" and "moves" strings`,
		}
	}

	var req movesRequest
	if body.Type != nil {
		puzzle, ok := cube.ParsePuzzle(*body.Type)
		if !ok {
			return movesRequest{}, &apiError{
				status:  http.StatusBadRequest,
				Code:    "invalid-type",
				Message: fmt.Sprintf(`%q is not a Puzzle type; want "3x3" or "2x2"`, *body.Type),
				Field:   "type",
			}
		}
		req.Puzzle = puzzle
	}
	for _, f := range []struct {
		name     string
		notation string
		moves    *[]cube.Move
	}{{"scramble", *body.Scramble, &req.Scramble}, {"moves", *body.Moves, &req.Moves}} {
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
		// A 2x2 has no middle Layer: only outer-Layer face Turns and whole-Cube
		// rotations make sense for it. A rotation is rigid (it turns the whole
		// Cube); a face Turn is corner-only. Reject slice Moves (M E S) and any
		// wide Turns here rather than let them reach the Pocket Move engine
		// (ADR 0005). Wide Turns are already rejected at parse time.
		if req.Puzzle == cube.Pocket {
			for _, m := range moves {
				if !isOuterTurn(m) && !m.IsRotation() {
					return movesRequest{}, &apiError{
						status:  http.StatusBadRequest,
						Code:    "invalid-notation",
						Message: fmt.Sprintf("%s: %v is not a face Turn or Cube rotation, which a 2x2 has no middle Layer for", f.name, m),
						Field:   f.name,
						Token:   m.String(),
					}
				}
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

// isOuterTurn reports whether m is an outer-Layer face Turn (R L U D F B),
// the only Moves that move a Pocket Cube's Pieces.
func isOuterTurn(m cube.Move) bool {
	switch m.Letter {
	case 'R', 'L', 'U', 'D', 'F', 'B':
		return true
	}
	return false
}
