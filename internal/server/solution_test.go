package server_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// What the Solve tests share: the response body as a client reads it, and
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

// inAlgorithm reports, for each of the Stage's Moves, whether it is part of
// an Algorithm the Stage reports.
func (s stageBody) inAlgorithm(t *testing.T) []bool {
	t.Helper()
	in := make([]bool, len(s.moves(t)))
	for _, a := range s.Algorithms {
		for j := a.Start; j < a.Start+a.Length && j >= 0 && j < len(in); j++ {
			in[j] = true
		}
	}
	return in
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

// methodStage is what the tests know of one Stage of the Method, from the
// spec.
type methodStage struct {
	id string
	// goal reports whether the Stage's goal holds on the Cube as it faces.
	goal func(cube.Cube) bool
	// whiteOn is the face the white center is on once the Stage's opening
	// Cube rotations, if any, are done.
	whiteOn cube.Face
	// setup reports whether the Stage may use a Move outside its Algorithms
	// after its opening Cube rotations.
	setup func(cube.Move) bool
	// algorithms gives the notation of each Algorithm the Stage may use, by
	// name.
	algorithms map[string]string
}

// The Method's seven Stages in order, from the spec. The property tests
// check every Stage a Solution contains against this list.
var method = []methodStage{
	{
		id: "white-cross", goal: whiteCrossOnTop, whiteOn: cube.U,
		setup: letterIn("RLUDFB"),
	},
	{
		id: "white-corners", goal: whiteLayerOnTop, whiteOn: cube.U,
		setup:      letterIn("yD"),
		algorithms: map[string]string{"Corner trigger": "R' D' R D"},
	},
	{
		id: "middle-edges", goal: firstTwoLayersWhiteDown, whiteOn: cube.D,
		setup:      letterIn("yU"),
		algorithms: map[string]string{"Right insert": "U R U' R' U' F' U F", "Left insert": "U' L' U L U F U' F'"},
	},
	{
		id: "yellow-cross", goal: yellowCrossOnTop, whiteOn: cube.D,
		setup:      letterIn("U"),
		algorithms: map[string]string{"Edge flip": "F R U R' U' F'"},
	},
	{
		id: "yellow-face", goal: yellowFaceOnTop, whiteOn: cube.D,
		setup:      letterIn("U"),
		algorithms: map[string]string{"Sune": "R U R' U R U2 R'"},
	},
	{
		id: "yellow-corners", goal: yellowCornersInPlace, whiteOn: cube.D,
		setup:      letterIn("yU"),
		algorithms: map[string]string{"A-perm": "R' F R' B2 R F' R' B2 R2"},
	},
	{
		id: "yellow-edges", goal: solvedWhiteDown, whiteOn: cube.D,
		setup:      letterIn("y"),
		algorithms: map[string]string{"U-perm": "R U' R U R U R U' R' U' R2"},
	},
}

func methodIndex(id string) int {
	return slices.IndexFunc(method, func(s methodStage) bool { return s.id == id })
}

func letterIn(letters string) func(cube.Move) bool {
	return func(m cube.Move) bool { return strings.IndexByte(letters, byte(m.Letter)) >= 0 }
}

// finishedAnywhere reports whether a Stage's goal holds on the Cube turned
// one of the ways that bring the white center to the top or the bottom.
func finishedAnywhere(st methodStage, c cube.Cube) bool {
	for _, turn := range []string{"", "x", "x'", "x2", "z", "z'"} {
		if st.goal(c.Apply(cube.MustParseMoves(turn)...)) {
			return true
		}
	}
	return false
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

// whiteLayerOnTop reports whether the white center is on top with the whole
// top layer around it: every white Sticker up, and every side Sticker of the
// layer matching the center below it.
func whiteLayerOnTop(c cube.Cube) bool {
	return c[cube.StickerAt(cube.U, 1, 1)] == cube.White &&
		piecesMatchCenters(c, func(s cube.Slot) bool { return s.Position[1] == 1 })
}

// firstTwoLayersWhiteDown reports whether the white center is on the bottom
// with the first two layers done: the whole bottom layer, and the four edges
// of the middle layer, every Sticker matching the center of its face.
func firstTwoLayersWhiteDown(c cube.Cube) bool {
	return c[cube.StickerAt(cube.D, 1, 1)] == cube.White &&
		piecesMatchCenters(c, func(s cube.Slot) bool { return s.Position[1] <= 0 })
}

// yellowCrossOnTop reports whether the first two layers are done with white
// on the bottom, and the four top edges have yellow facing up.
func yellowCrossOnTop(c cube.Cube) bool {
	return firstTwoLayersWhiteDown(c) && topYellow(c, func(row, col int) bool { return (row+col)%2 == 1 })
}

// yellowFaceOnTop reports whether the first two layers are done with white
// on the bottom, and the whole top face is yellow.
func yellowFaceOnTop(c cube.Cube) bool {
	return firstTwoLayersWhiteDown(c) && topYellow(c, func(row, col int) bool { return true })
}

// yellowCornersInPlace reports whether the whole top face is yellow, over the
// first two layers with white on the bottom, and every Sticker of the four
// top corners matches the center of its face.
func yellowCornersInPlace(c cube.Cube) bool {
	return yellowFaceOnTop(c) &&
		piecesMatchCenters(c, func(s cube.Slot) bool { return s.Position[1] == 1 && len(s.Stickers) == 3 })
}

// solvedWhiteDown reports whether the Cube is solved with white on the
// bottom.
func solvedWhiteDown(c cube.Cube) bool {
	return c[cube.StickerAt(cube.D, 1, 1)] == cube.White && c.IsSolved()
}

// topYellow reports whether the top face's Stickers that at picks, by row
// and column, are all yellow.
func topYellow(c cube.Cube, at func(row, col int) bool) bool {
	for row := range 3 {
		for col := range 3 {
			if at(row, col) && c[cube.StickerAt(cube.U, row, col)] != cube.Yellow {
				return false
			}
		}
	}
	return true
}

// piecesMatchCenters reports whether every Sticker of the Pieces in the
// Slots that in picks matches the center of its face.
func piecesMatchCenters(c cube.Cube, in func(cube.Slot) bool) bool {
	for _, slot := range cube.Slots() {
		if !in(slot) {
			continue
		}
		for _, s := range slot.Stickers {
			if c[s] != c[cube.StickerAt(s.Face(), 1, 1)] {
				return false
			}
		}
	}
	return true
}

var (
	whiteEdges   = []string{"white-green edge", "white-blue edge", "white-red edge", "white-orange edge"}
	whiteCorners = []string{"white-green-red corner", "white-green-orange corner", "white-blue-red corner", "white-blue-orange corner"}
	middleEdges  = []string{"green-red edge", "green-orange edge", "blue-red edge", "blue-orange edge"}
)

// sameSet reports whether two lists hold the same names, in any order.
func sameSet(a, b []string) bool {
	return slices.Equal(slices.Sorted(slices.Values(a)), slices.Sorted(slices.Values(b)))
}
