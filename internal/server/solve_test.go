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

	if s.Solved || len(s.Stages) != 1 {
		t.Fatalf("got solved=%v with %d Stages, want just Stage 1", s.Solved, len(s.Stages))
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
