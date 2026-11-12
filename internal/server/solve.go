package server

import (
	"net/http"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/solver"
)

// handleSolve is POST /api/solve: the Solution for the Cube a Scramble and a
// Move history produce.
func handleSolve(w http.ResponseWriter, r *http.Request) {
	req, apiErr := decodeMovesRequest(w, r)
	if apiErr != nil {
		writeError(w, apiErr)
		return
	}
	writeJSON(w, http.StatusOK, solveResponseFor(solver.Solve(req.Cube())))
}

// solveResponse is the POST /api/solve response body: {"solved":true}, or
// the Stages, with every Move sequence in space-separated notation.
type solveResponse struct {
	Solved bool        `json:"solved"`
	Stages []stageJSON `json:"stages,omitzero"`
}

type stageJSON struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Goal  string `json:"goal"`
	Moves string `json:"moves"`
	// Notes holds the note on each Move that has one, in Move order.
	Notes      []noteJSON      `json:"notes"`
	Algorithms []algorithmJSON `json:"algorithms"`
	Pieces     []string        `json:"pieces"`
}

// noteJSON is the note on the Stage's Move at index At of its Moves.
type noteJSON struct {
	At   int    `json:"at"`
	Text string `json:"text"`
}

// algorithmJSON is one use of an Algorithm: its Moves are the Stage's Moves
// from index Start, Length of them.
type algorithmJSON struct {
	Name     string `json:"name"`
	Notation string `json:"notation"`
	Start    int    `json:"start"`
	Length   int    `json:"length"`
}

func solveResponseFor(s solver.Solution) solveResponse {
	if s.Solved {
		return solveResponse{Solved: true}
	}
	stages := make([]stageJSON, len(s.Stages))
	for i, st := range s.Stages {
		moves := make([]cube.Move, len(st.Moves))
		notes := []noteJSON{}
		for j, m := range st.Moves {
			moves[j] = m.Move
			if m.Note != "" {
				notes = append(notes, noteJSON{At: j, Text: m.Note})
			}
		}
		algorithms := make([]algorithmJSON, len(st.Algorithms))
		for j, a := range st.Algorithms {
			algorithms[j] = algorithmJSON{Name: a.Name, Notation: cube.FormatMoves(a.Moves), Start: a.Start, Length: len(a.Moves)}
		}
		stages[i] = stageJSON{
			ID:         st.ID,
			Name:       st.Name,
			Goal:       st.Goal,
			Moves:      cube.FormatMoves(moves),
			Notes:      notes,
			Algorithms: algorithms,
			Pieces:     append([]string{}, st.Pieces...),
		}
	}
	return solveResponse{Stages: stages}
}
