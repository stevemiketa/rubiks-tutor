package server_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// What the solve tests share: the response body as a client reads it, and
// the Stage goals, checked with the Go cube model.

type solutionBody struct {
	Solved bool        `json:"solved"`
	Stages []stageBody `json:"stages"`
}

type stageBody struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Goal  string `json:"goal"`
	Moves string `json:"moves"`
	Notes []struct {
		At   int    `json:"at"`
		Text string `json:"text"`
	} `json:"notes"`
	Algorithms []struct {
		Name     string `json:"name"`
		Notation string `json:"notation"`
		Start    int    `json:"start"`
		Length   int    `json:"length"`
	} `json:"algorithms"`
	Pieces []string `json:"pieces"`
}

// moves parses the Stage's Moves, failing the test if they aren't notation.
func (s stageBody) moves(t *testing.T) []cube.Move {
	t.Helper()
	ms, err := cube.ParseMoves(s.Moves)
	if err != nil {
		t.Fatalf("Stage %s: Moves %q: %v", s.ID, s.Moves, err)
	}
	return ms
}

// solve posts a Scramble and a Move history to POST /api/solve and decodes
// the Solution, failing the test on anything but 200.
func solve(t *testing.T, h http.Handler, scramble, moves string) solutionBody {
	t.Helper()
	res := post(t, h, "/api/solve", solveBody(t, scramble, moves))
	raw := body(t, res)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("solving %q then %q: status %d: %s", scramble, moves, res.StatusCode, raw)
	}
	var s solutionBody
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatalf("solving %q then %q: body is not a Solution: %v: %s", scramble, moves, err, raw)
	}
	return s
}

// The Method's Stages in order, each with a check that its goal holds on the
// Cube at its end. Later Stages add their goal here; the property tests check
// every Stage a Solution contains against this list.
var method = []struct {
	id   string
	goal func(cube.Cube) bool
}{
	{"white-cross", whiteCrossOnTop},
}

func methodIndex(id string) int {
	return slices.IndexFunc(method, func(s struct {
		id   string
		goal func(cube.Cube) bool
	}) bool {
		return s.id == id
	})
}

// whiteCrossOnTop reports whether the white center is on top with the four
// white edges around it, white up, each matching the center beside it.
func whiteCrossOnTop(c cube.Cube) bool {
	if c[cube.StickerAt(cube.U, 1, 1)] != cube.White {
		return false
	}
	for _, slot := range cube.Slots() {
		if len(slot.Stickers) != 2 || slot.Stickers[0].Face() != cube.U {
			continue
		}
		top, side := slot.Stickers[0], slot.Stickers[1]
		if c[top] != cube.White || c[side] != c[cube.StickerAt(side.Face(), 1, 1)] {
			return false
		}
	}
	return true
}

// whiteCrossAnywhere reports whether the four white edges sit around the
// white center, wherever it is, each matching the center beside it.
func whiteCrossAnywhere(c cube.Cube) bool {
	for _, up := range []string{"", "x", "x'", "x2", "z", "z'"} {
		if whiteCrossOnTop(c.Apply(cube.MustParseMoves(up)...)) {
			return true
		}
	}
	return false
}

var whiteEdges = []string{"white-green edge", "white-blue edge", "white-red edge", "white-orange edge"}
