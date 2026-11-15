package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// post sends a JSON body to the router and returns the response.
func post(t *testing.T, h http.Handler, path, jsonBody string) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	return rec.Result()
}

// solveBody is a POST /api/solve request body.
func solveBody(t *testing.T, scramble, moves string) string {
	t.Helper()
	b, err := json.Marshal(map[string]string{"scramble": scramble, "moves": moves})
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// solveBodyFor is a POST /api/solve request body with an explicit puzzle type.
func solveBodyFor(t *testing.T, scramble, moves, puzzleType string) string {
	t.Helper()
	b, err := json.Marshal(map[string]string{"scramble": scramble, "moves": moves, "type": puzzleType})
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// solveTyped posts a solve request with a type and decodes the Solution.
func solveTyped(t *testing.T, h http.Handler, scramble, moves, puzzleType string) solutionBody {
	t.Helper()
	res := post(t, h, "/api/solve", solveBodyFor(t, scramble, moves, puzzleType))
	raw := body(t, res)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("solving %q then %q as %q: status %d: %s", scramble, moves, puzzleType, res.StatusCode, raw)
	}
	var s solutionBody
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatalf("solving %q then %q as %q: body is not a Solution: %v: %s", scramble, moves, puzzleType, err, raw)
	}
	return s
}

func TestSolveRoutesTheTypeToThePuzzle(t *testing.T) {
	h := newTestServer(t)
	// Corner-only face Turns, so the Cube is a valid Pocket Cube Scramble.
	const scramble = "R U R' F2 R U' R' U R2 F R F'"

	t.Run("2x2 uses only the corner Stages", func(t *testing.T) {
		s := solveTyped(t, h, scramble, "", "2x2")
		if s.Solved || len(s.Stages) == 0 {
			t.Fatalf("got solved=%v with %d Stages", s.Solved, len(s.Stages))
		}
		for _, st := range s.Stages {
			switch st.ID {
			case "white-corners", "yellow-face", "yellow-corners":
			default:
				t.Errorf("2x2 Solution has Stage %q, want only the three corner Stages", st.ID)
			}
			for _, m := range st.moves(t) {
				if m.IsRotation() {
					t.Errorf("2x2 Stage %s has Cube rotation %v in its Moves %q", st.ID, m, st.Moves)
				}
			}
		}
		// Replaying every Stage's Moves with corner-only semantics solves the
		// Pocket Cube.
		c := cube.Solved().ApplyPocket(cube.MustParseMoves(scramble)...)
		for _, st := range s.Stages {
			c = c.ApplyPocket(st.moves(t)...)
		}
		if !c.IsSolved() {
			t.Errorf("the 2x2 Solution %v left the Pocket Cube unsolved: %v", stageIDs(s), c)
		}
	})

	t.Run("a missing type is the 3x3", func(t *testing.T) {
		withType := solveTyped(t, h, scramble, "", "3x3")
		withoutType := solve(t, h, scramble, "")
		if !slices.Equal(stageIDs(withType), stageIDs(withoutType)) {
			t.Errorf("missing type gave Stages %v, want the 3x3's %v", stageIDs(withoutType), stageIDs(withType))
		}
		// The 3x3 Solution for this Scramble runs the full Method, so it has
		// more than the three corner Stages a 2x2 would.
		if len(stageIDs(withoutType)) <= 3 {
			t.Errorf("a 3x3 Solution has only %d Stages: %v", len(stageIDs(withoutType)), stageIDs(withoutType))
		}
	})

	t.Run("an already-solved 2x2 reports solved", func(t *testing.T) {
		s := solveTyped(t, h, "R U R' U'", "U R U' R'", "2x2")
		if !s.Solved || s.Stages != nil {
			t.Errorf("got solved=%v with Stages %v, want solved with no Stages", s.Solved, stageIDs(s))
		}
	})
}

func TestSolveRejectsAnUnknownTypeAndSliceOrWideTurnsForA2x2(t *testing.T) {
	// A 2x2 has no middle Layer, so slice Moves (M E S) and wide Turns are
	// rejected; whole-Cube rotations (x y z) are accepted, as a fixed camera
	// needs them to see the other sides (ADR 0005).
	h := newTestServer(t)
	for _, tc := range []struct {
		name, body, code, field string
	}{
		{"an unknown type", `{"scramble":"R","moves":"","type":"4x4"}`, "invalid-type", "type"},
		{"a middle-Layer Turn in a 2x2 Scramble", `{"scramble":"R M","moves":"","type":"2x2"}`, "invalid-notation", "scramble"},
		{"an S slice in a 2x2 history", `{"scramble":"R","moves":"S","type":"2x2"}`, "invalid-notation", "moves"},
		{"an E slice in a 2x2 history", `{"scramble":"R","moves":"E'","type":"2x2"}`, "invalid-notation", "moves"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := post(t, h, "/api/solve", tc.body)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status %d, want 400: %s", res.StatusCode, body(t, res))
			}
			if got := decodeError(t, res); got.Code != tc.code || got.Field != tc.field {
				t.Errorf("error %+v, want code %s, field %s", got, tc.code, tc.field)
			}
		})
	}
}

func TestSolveAcceptsAWholeCubeRotationForA2x2(t *testing.T) {
	// A whole-Cube rotation is rigid on a Pocket Cube: reconstructing the Cube
	// with full Apply keeps the corner-to-center relationship, so a solve
	// request whose history contains a rotation succeeds and the returned
	// Solution is rotation-free and reaches solved.
	h := newTestServer(t)
	const scramble = "R U R' F2 R U' R' U R2 F R F'"
	const history = "x" // see the other sides; must stay a real logical Move

	s := solveTyped(t, h, scramble, history, "2x2")
	if s.Solved {
		t.Fatalf("a rotated scrambled 2x2 reports solved; want Stages to solve it")
	}
	for _, st := range s.Stages {
		for _, m := range st.moves(t) {
			if m.IsRotation() {
				t.Errorf("2x2 Stage %s has Cube rotation %v in %q; a 2x2 Solution must be rotation-free", st.ID, m, st.Moves)
			}
		}
	}
	// The Cube the request describes, reached the same rigid way: the Scramble
	// and the rotation move the whole Cube, so replaying the rotation-free
	// Solution's Turns with corner-only semantics reaches solved.
	c := cube.Solved().ApplyPocket(cube.MustParseMoves(scramble)...).Apply(cube.MustParseMoves(history)...)
	for _, st := range s.Stages {
		c = c.ApplyPocket(st.moves(t)...)
	}
	if !c.IsSolved() {
		t.Errorf("the 2x2 Solution %v left the rotated Pocket Cube unsolved: %v", stageIDs(s), c)
	}
}

func TestSolveReportsASolvedCube(t *testing.T) {
	for _, tc := range []struct{ name, scramble, moves string }{
		{"nothing to undo", "", ""},
		{"moves that undo the Scramble", "R U F'", "F U' R'"},
		{"solved but rotated", "", "x y2 z'"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := post(t, newTestServer(t), "/api/solve", solveBody(t, tc.scramble, tc.moves))

			if res.StatusCode != http.StatusOK {
				t.Fatalf("status %d, want 200: %s", res.StatusCode, body(t, res))
			}
			if got := res.Header.Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type %q, want application/json", got)
			}
			if got, want := body(t, res), `{"solved":true}`+"\n"; got != want {
				t.Errorf("body %q, want %q", got, want)
			}
		})
	}
}

func TestSolveMakesTheWhiteCrossAsStage1(t *testing.T) {
	const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
	s := solve(t, newTestServer(t), scramble, "")

	if s.Solved || len(s.Stages) == 0 {
		t.Fatalf("got solved=%v with %d Stages, want Stage 1 first", s.Solved, len(s.Stages))
	}
	st := s.Stages[0]
	if st.ID != "white-cross" || st.Name != "White cross" ||
		st.Goal != "Make a white cross on top, with each edge matching the center beside it." {
		t.Errorf("Stage 1 is %q %q %q", st.ID, st.Name, st.Goal)
	}
	if st.Algorithms == nil || len(st.Algorithms) != 0 {
		t.Errorf("Stage 1 Algorithms = %v, want an empty list", st.Algorithms)
	}
	if got := slices.Sorted(slices.Values(st.Pieces)); !slices.Equal(got, slices.Sorted(slices.Values(whiteEdges))) {
		t.Errorf("Stage 1 Pieces = %v, want the four white edges", st.Pieces)
	}

	moves := st.moves(t)
	if len(moves) == 0 {
		t.Fatal("Stage 1 has no Moves")
	}
	if len(st.Notes) != len(moves) {
		t.Errorf("Stage 1 has %d notes for %d Moves, want one on each: %v", len(st.Notes), len(moves), st.Notes)
	}
	for i, n := range st.Notes {
		if n.At != i || n.Text == "" {
			t.Errorf("note %d is %+v, want a note on Move %d", i, n, i)
		}
	}
	start := cube.Solved().Apply(cube.MustParseMoves(scramble)...)
	if end := start.Apply(moves...); !whiteCrossOnTop(end) {
		t.Errorf("after Stage 1's Moves %q the Cube is %s, which has no white cross on top", st.Moves, end)
	}
}

func TestSolveStartsByPuttingTheWhiteCenterOnTop(t *testing.T) {
	const scramble = "R U2 F' L D B2 R' U F2 L' D2 B R2 U' F L2 D' B' R U' F2 L D B' R2"
	// Middle-Layer Turns and Cube rotations move the white center.
	for _, history := range []string{"x", "x'", "x2", "z", "z'", "M", "S'", "E M' x z", "y x2 S"} {
		t.Run(history, func(t *testing.T) {
			s := solve(t, newTestServer(t), scramble, history)
			if len(s.Stages) == 0 || s.Stages[0].ID != "white-cross" {
				t.Fatalf("got Stages %v, want the white cross first", s.Stages)
			}

			c := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + history)...)
			moves := s.Stages[0].moves(t)
			i := 0
			for ; i < len(moves) && moves[i].IsRotation(); i++ {
				c = c.Apply(moves[i])
			}
			if c[cube.StickerAt(cube.U, 1, 1)] != cube.White {
				t.Errorf("after the opening Cube rotations %s the white center is not on top", cube.FormatMoves(moves[:i]))
			}
			if slices.ContainsFunc(moves[i:], cube.Move.IsRotation) {
				t.Errorf("Stage 1 %q has Cube rotations after its first Turn", s.Stages[0].Moves)
			}
		})
	}
}

func TestSolveFillsInTheWhiteCornersAsStage2(t *testing.T) {
	const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
	s := solve(t, newTestServer(t), scramble, "")
	checkSolution(t, scramble, "", s)

	if len(s.Stages) < 2 || s.Stages[1].ID != "white-corners" {
		t.Fatalf("got Stages %v, want the white corners second", stageIDs(s))
	}
	st := s.Stages[1]
	if st.Name != "White corners" || st.Goal != "Fill in the white corners to finish the first layer." {
		t.Errorf("Stage 2 is %q %q", st.Name, st.Goal)
	}
	if !sameSet(st.Pieces, whiteCorners) {
		t.Errorf("Stage 2 Pieces = %v, want the four white corners", st.Pieces)
	}
	if len(st.Algorithms) == 0 {
		t.Fatal("Stage 2 uses no Algorithm")
	}
	for _, a := range st.Algorithms {
		if a.Name != "Corner trigger" || a.Notation != "R' D' R D" {
			t.Errorf("Stage 2 uses %q %q, want only the corner trigger R' D' R D", a.Name, a.Notation)
		}
	}
	// White is already on top after Stage 1, so outside the corner trigger
	// the Stage only rotates the Cube about y and turns the bottom Layer.
	moves, inAlgorithm := st.moves(t), st.inAlgorithm(t)
	for i, m := range moves {
		if !inAlgorithm[i] && m.Letter != 'y' && m.Letter != 'D' {
			t.Errorf("Stage 2 Move %d is %v, outside the corner trigger; want only y and D", i, m)
		}
	}

	start := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + s.Stages[0].Moves)...)
	if end := start.Apply(moves...); !whiteLayerOnTop(end) {
		t.Errorf("after Stage 2's Moves %q the Cube is %s, which has no white layer on top", st.Moves, end)
	}
}

func TestSolveRotatesWhiteToTheBottomAndPlacesTheMiddleEdgesAsStage3(t *testing.T) {
	const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
	s := solve(t, newTestServer(t), scramble, "")
	checkSolution(t, scramble, "", s)

	if len(s.Stages) < 3 || s.Stages[2].ID != "middle-edges" {
		t.Fatalf("got Stages %v, want the middle layer third", stageIDs(s))
	}
	st := s.Stages[2]
	if st.Name != "Middle layer" || st.Goal != "Rotate the Cube so white is on the bottom, then place the four middle-layer edges." {
		t.Errorf("Stage 3 is %q %q", st.Name, st.Goal)
	}
	if !sameSet(st.Pieces, middleEdges) {
		t.Errorf("Stage 3 Pieces = %v, want the four middle-layer edges", st.Pieces)
	}

	start := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + s.Stages[0].Moves + " " + s.Stages[1].Moves)...)
	moves, inAlgorithm := st.moves(t), st.inAlgorithm(t)
	if len(moves) == 0 || !moves[0].IsRotation() || inAlgorithm[0] || start.Apply(moves[0])[cube.StickerAt(cube.D, 1, 1)] != cube.White {
		t.Fatalf("Stage 3 %q doesn't start with a Cube rotation that turns white to the bottom", st.Moves)
	}
	if len(st.Notes) == 0 || st.Notes[0].At != 0 {
		t.Errorf("Stage 3's opening Cube rotation has no note: %v", st.Notes)
	}

	inserts := map[string]string{"Right insert": "U R U' R' U' F' U F", "Left insert": "U' L' U L U F U' F'"}
	if len(st.Algorithms) == 0 {
		t.Error("Stage 3 uses no Algorithm")
	}
	for _, a := range st.Algorithms {
		if inserts[a.Name] != a.Notation {
			t.Errorf("Stage 3 uses %q %q, want only the right and left inserts", a.Name, a.Notation)
		}
	}
	// After that rotation, outside the inserts the Stage only rotates the Cube
	// about y and turns the top Layer.
	for i, m := range moves[1:] {
		if !inAlgorithm[i+1] && m.Letter != 'y' && m.Letter != 'U' {
			t.Errorf("Stage 3 Move %d is %v, outside the inserts; want only y and U", i+1, m)
		}
	}

	if end := start.Apply(moves...); !firstTwoLayersWhiteDown(end) {
		t.Errorf("after Stage 3's Moves %q the Cube is %s, which doesn't have white down and the first two layers done", st.Moves, end)
	}
}

func TestSolveFinishesTheLastLayerAsStages4To7(t *testing.T) {
	const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
	s := solve(t, newTestServer(t), scramble, "")
	checkSolution(t, scramble, "", s) // which checks that the Solution solves the Cube

	yellowEdges := []string{"yellow-green edge", "yellow-blue edge", "yellow-red edge", "yellow-orange edge"}
	yellowCorners := []string{"yellow-green-red corner", "yellow-green-orange corner", "yellow-blue-red corner", "yellow-blue-orange corner"}
	want := []struct {
		id, name, goal      string
		pieces              []string
		algorithm, notation string
	}{
		{"yellow-cross", "Yellow cross", "Make a yellow cross on top.", yellowEdges, "Edge flip", "F R U R' U' F'"},
		{"yellow-face", "Yellow face", "Twist the top corners until the whole top is yellow.", yellowCorners, "Sune", "R U R' U R U2 R'"},
		{"yellow-corners", "Yellow corners", "Move the top corners to their correct spots.", yellowCorners, "A-perm", "R' F R' B2 R F' R' B2 R2"},
		{"yellow-edges", "Yellow edges", "Move the top edges to their correct spots to finish the Cube.", yellowEdges, "U-perm", "R U' R U R U R U' R' U' R2"},
	}
	if got := stageIDs(s); len(got) != 7 {
		t.Fatalf("got Stages %v, want all seven", got)
	}
	for i, w := range want {
		st := s.Stages[3+i]
		if st.ID != w.id || st.Name != w.name || st.Goal != w.goal {
			t.Errorf("Stage %d is %q %q %q, want %q %q %q", 4+i, st.ID, st.Name, st.Goal, w.id, w.name, w.goal)
		}
		if !sameSet(st.Pieces, w.pieces) {
			t.Errorf("Stage %s Pieces = %v, want %v", st.ID, st.Pieces, w.pieces)
		}
		for _, a := range st.Algorithms {
			if a.Name != w.algorithm || a.Notation != w.notation {
				t.Errorf("Stage %s uses %q %q, want only %s %s", st.ID, a.Name, a.Notation, w.algorithm, w.notation)
			}
		}
	}
}

func TestSolveNotesEachTurnOfTheTopInTheYellowStages(t *testing.T) {
	// Cubes with only the last layer to do: from solved, with white on top,
	// the yellow layer is turned or worked on from below.
	for _, history := range []string{
		"D",                                // only the top to turn, once white is on the bottom
		"x2 F U R U' R' F' U x2",           // a yellow line from front to back
		"x2 R U2 R' U' R U' R' U x2",       // Sune's case, turned
		"x2 U R' F R' B2 R F' R' B2 R2 x2", // three corners moved round, top turned
	} {
		t.Run(history, func(t *testing.T) {
			s := solve(t, newTestServer(t), "", history)
			checkSolution(t, "", history, s)

			turns := 0
			for _, st := range s.Stages {
				notes := map[int]string{}
				for _, n := range st.Notes {
					notes[n.At] = n.Text
				}
				inAlgorithm := st.inAlgorithm(t)
				for i, m := range st.moves(t) {
					if m.Letter != 'U' || inAlgorithm[i] {
						continue
					}
					turns++
					if !strings.Contains(notes[i], "top") {
						t.Errorf("Stage %s Move %d (%v) turns the top with note %q, want a note saying what turning the top does", st.ID, i, m, notes[i])
					}
				}
			}
			if turns == 0 {
				t.Errorf("the Solution %v turns the top only inside Algorithms; want a Turn to set one up", stageIDs(s))
			}
		})
	}
}

// errorBody is an API error response body.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field"`
	Token   string `json:"token"`
	Offset  *int   `json:"offset"`
}

func decodeError(t *testing.T, res *http.Response) errorBody {
	t.Helper()
	var e errorBody
	raw := body(t, res)
	if err := json.Unmarshal([]byte(raw), &e); err != nil {
		t.Fatalf("error body is not JSON: %q", raw)
	}
	if e.Code == "" || e.Message == "" {
		t.Errorf("error body %q lacks a code or a message", raw)
	}
	return e
}

func TestSolveRejectsInvalidNotationWithItsPosition(t *testing.T) {
	for _, tc := range []struct {
		name, scramble, moves string
		field, token          string
		offset                int
	}{
		{"a bad Move in the history", "R U", "F  X2 R", "moves", "X2", 3},
		{"a wide Turn in the Scramble", "R Rw U", "", "scramble", "Rw", 2},
		{"a lone suffix", "", "'", "moves", "'", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := post(t, newTestServer(t), "/api/solve", solveBody(t, tc.scramble, tc.moves))

			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status %d, want 400", res.StatusCode)
			}
			got := decodeError(t, res)
			if got.Code != "invalid-notation" || got.Field != tc.field || got.Token != tc.token ||
				got.Offset == nil || *got.Offset != tc.offset {
				t.Errorf("error %+v, want code invalid-notation, field %s, token %q at offset %d", got, tc.field, tc.token, tc.offset)
			}
		})
	}
}

func TestSolveRejectsABodyThatIsNotAMovesRequest(t *testing.T) {
	for _, jsonBody := range []string{``, `{"scramble":`, `[]`, `{"scramble":["R"],"moves":""}`, `{"moves":7}`} {
		t.Run(jsonBody, func(t *testing.T) {
			res := post(t, newTestServer(t), "/api/solve", jsonBody)

			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("status %d, want 400", res.StatusCode)
			}
			if got := decodeError(t, res); got.Code != "invalid-request" {
				t.Errorf("code %q, want invalid-request", got.Code)
			}
		})
	}
}

func TestSolveAcceptsUpTo10000MovesAndRejectsMore(t *testing.T) {
	// "R" 5,000 times then "R'" 5,000 times leaves the Cube solved.
	scramble := strings.TrimSpace(strings.Repeat("R ", 5000))
	undo := strings.TrimSpace(strings.Repeat("R' ", 5000))

	res := post(t, newTestServer(t), "/api/solve", solveBody(t, scramble, undo))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("10,000 Moves: status %d, want 200: %s", res.StatusCode, body(t, res))
	}

	res = post(t, newTestServer(t), "/api/solve", solveBody(t, scramble, undo+" U"))
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("10,001 Moves: status %d, want 413", res.StatusCode)
	}
	if got := decodeError(t, res); got.Code != "too-many-moves" {
		t.Errorf("10,001 Moves: code %q, want too-many-moves", got.Code)
	}
}

func TestSolveRejectsAnOversizedBody(t *testing.T) {
	// Fewer than 10,000 Moves, padded far beyond any real request.
	padded := "R" + strings.Repeat(" ", 1<<20) + "U"

	res := post(t, newTestServer(t), "/api/solve", solveBody(t, "", padded))

	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status %d, want 413", res.StatusCode)
	}
	if got := decodeError(t, res); got.Code != "body-too-large" {
		t.Errorf("code %q, want body-too-large", got.Code)
	}
}
