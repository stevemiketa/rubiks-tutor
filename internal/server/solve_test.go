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

func TestSolveFlipsWhiteToTheBottomAndPlacesTheMiddleEdgesAsStage3(t *testing.T) {
	const scramble = "D2 F' R U2 B L' D R2 F U' L2 B' D' R F2 U L D2 B2 R' U2 F L' B D'"
	s := solve(t, newTestServer(t), scramble, "")
	checkSolution(t, scramble, "", s)

	if len(s.Stages) < 3 || s.Stages[2].ID != "middle-edges" {
		t.Fatalf("got Stages %v, want the middle layer third", stageIDs(s))
	}
	st := s.Stages[2]
	if st.Name != "Middle layer" || st.Goal != "Flip white to the bottom, then place the four middle-layer edges." {
		t.Errorf("Stage 3 is %q %q", st.Name, st.Goal)
	}
	if !sameSet(st.Pieces, middleEdges) {
		t.Errorf("Stage 3 Pieces = %v, want the four middle-layer edges", st.Pieces)
	}

	start := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + s.Stages[0].Moves + " " + s.Stages[1].Moves)...)
	moves, inAlgorithm := st.moves(t), st.inAlgorithm(t)
	if len(moves) == 0 || !moves[0].IsRotation() || inAlgorithm[0] || start.Apply(moves[0])[cube.StickerAt(cube.D, 1, 1)] != cube.White {
		t.Fatalf("Stage 3 %q doesn't start with a Cube rotation that flips white to the bottom", st.Moves)
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
	// After the flip, outside the inserts the Stage only rotates the Cube
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
