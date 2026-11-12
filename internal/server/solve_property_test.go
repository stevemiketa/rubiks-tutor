package server_test

import (
	"flag"
	"math/rand/v2"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Solver property tests, through POST /api/solve with seeded random inputs.
// A failure names the Scramble and Move history that caused it; rerun with
// the same -solve-seed to get the same inputs.
//
// Each Stage a Solution contains is checked against the goal its entry in
// method (solution_test.go) gives, so a new Stage needs only its goal there.

var solveSeed = flag.Uint64("solve-seed", 2026, "seed for the solver property tests' random inputs")

const propertyCases = 300

// solveTimeLimit is the 95th-percentile time Solve must stay under.
const solveTimeLimit = 100 * time.Millisecond

func TestSolutionsFollowTheMethod(t *testing.T) {
	h := newTestServer(t)
	timer := &solveTimer{}
	r := rand.New(rand.NewPCG(*solveSeed, 0))

	for range propertyCases {
		scramble, history := randomScramble(r), randomHistory(r)
		s := timer.solve(t, h, scramble, history)
		checkSolution(t, scramble, history, s)

		// The same input gives the same Solution, byte for byte.
		again := post(t, h, "/api/solve", solveBody(t, scramble, history))
		if first := solutionJSON(t, h, scramble, history); body(t, again) != first {
			t.Errorf("solving %q then %q twice gave different Solutions", scramble, history)
		}

		// Playing the first k Stages, then solving again, skips exactly them.
		played := history
		for k, st := range s.Stages {
			played = strings.TrimSpace(played + " " + st.Moves)
			rest := timer.solve(t, h, scramble, played)
			if got, want := stageIDs(rest), stageIDs(solutionBody{Stages: s.Stages[k+1:]}); !slices.Equal(got, want) {
				t.Errorf("solving %q then %q after playing %d Stage(s): got Stages %v, want %v",
					scramble, history, k+1, got, want)
			}
		}
	}
	timer.check(t)
}

func TestSolveSkipsAWhiteCrossThatIsAlreadyFinished(t *testing.T) {
	h := newTestServer(t)
	timer := &solveTimer{}
	r := rand.New(rand.NewPCG(*solveSeed, 1))

	for range propertyCases {
		// A Cube with the cross finished: built from a solved one by Moves
		// that keep it, or from a scrambled one by its own Stage 1. Either
		// way the Cube is then turned to face a random way.
		scramble, history := "", crossKeepingMoves(r)
		if r.IntN(2) == 0 {
			scramble, history = randomScramble(r), randomHistory(r)
			for _, st := range timer.solve(t, h, scramble, history).Stages {
				if st.ID == "white-cross" {
					history = strings.TrimSpace(history + " " + st.Moves + " " + crossKeepingMoves(r))
				}
			}
		}
		history = strings.TrimSpace(history + " " + randomRotations(r))
		c := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + history)...)
		if !whiteCrossAnywhere(c) {
			t.Fatalf("the test built %q then %q, which has no white cross", scramble, history)
		}

		s := timer.solve(t, h, scramble, history)
		if slices.Contains(stageIDs(s), "white-cross") {
			t.Errorf("solving %q then %q, whose white cross is finished: got Stages %v", scramble, history, stageIDs(s))
		}
		checkSolution(t, scramble, history, s)
	}
	timer.check(t)
}

// checkSolution checks a Solution against the Method: Stages in order, each
// goal met at the end of its Stage, Algorithms where they say they are, and a
// note on every Move outside an Algorithm.
func checkSolution(t *testing.T, scramble, history string, s solutionBody) {
	t.Helper()
	c := cube.Solved().Apply(cube.MustParseMoves(scramble + " " + history)...)
	input := "solving " + quote(scramble) + " then " + quote(history)
	if s.Solved != c.IsSolved() {
		t.Errorf("%s: solved=%v for a Cube that is %v", input, s.Solved, c)
	}
	if s.Solved && s.Stages != nil {
		t.Errorf("%s: a solved Cube got Stages %v", input, stageIDs(s))
	}
	if !s.Solved && s.Stages == nil {
		t.Errorf("%s: an unsolved Cube got no Stages list", input)
	}

	last := -1
	for _, st := range s.Stages {
		i := methodIndex(st.ID)
		if i < 0 {
			t.Errorf("%s: unknown Stage %q", input, st.ID)
			return
		}
		if i <= last {
			t.Errorf("%s: Stages out of Method order: %v", input, stageIDs(s))
		}
		last = i

		moves := st.moves(t)
		inAlgorithm := make([]bool, len(moves))
		for _, a := range st.Algorithms {
			notation, err := cube.ParseMoves(a.Notation)
			if err != nil || a.Start < 0 || a.Length != len(notation) || a.Start+a.Length > len(moves) ||
				!slices.Equal(moves[a.Start:a.Start+a.Length], notation) {
				t.Errorf("%s: Stage %s: Algorithm %+v does not match its Moves %q", input, st.ID, a, st.Moves)
				continue
			}
			for j := range a.Length {
				inAlgorithm[a.Start+j] = true
			}
		}
		noted := make([]bool, len(moves))
		for j, n := range st.Notes {
			if n.At < 0 || n.At >= len(moves) || (j > 0 && n.At <= st.Notes[j-1].At) || n.Text == "" {
				t.Errorf("%s: Stage %s: bad note %+v for Moves %q", input, st.ID, n, st.Moves)
				continue
			}
			noted[n.At] = true
		}
		for j := range moves {
			if !inAlgorithm[j] && !noted[j] {
				t.Errorf("%s: Stage %s: Move %d (%v) is outside any Algorithm and has no note", input, st.ID, j, moves[j])
			}
		}

		c = c.Apply(moves...)
		if !method[i].goal(c) {
			t.Errorf("%s: the goal of Stage %s does not hold at its end: %v", input, st.ID, c)
		}
	}
}

func stageIDs(s solutionBody) []string {
	ids := []string{}
	for _, st := range s.Stages {
		ids = append(ids, st.ID)
	}
	return ids
}

func solutionJSON(t *testing.T, h http.Handler, scramble, history string) string {
	t.Helper()
	return body(t, post(t, h, "/api/solve", solveBody(t, scramble, history)))
}

func quote(notation string) string { return `"` + notation + `"` }

// solveTimer times each solve and checks the 95th percentile.
type solveTimer struct{ times []time.Duration }

func (st *solveTimer) solve(t *testing.T, h http.Handler, scramble, history string) solutionBody {
	t.Helper()
	start := time.Now()
	s := solve(t, h, scramble, history)
	st.times = append(st.times, time.Since(start))
	return s
}

func (st *solveTimer) check(t *testing.T) {
	t.Helper()
	slices.Sort(st.times)
	p95 := st.times[len(st.times)*95/100]
	t.Logf("%d solves: median %v, 95th percentile %v, slowest %v", len(st.times), st.times[len(st.times)/2], p95, st.times[len(st.times)-1])
	if p95 >= solveTimeLimit {
		t.Errorf("Solve took %v at the 95th percentile, want under %v", p95, solveTimeLimit)
	}
}

// Random inputs.

var (
	outerTurns = movesOf("RLUDFB")
	everyMove  = movesOf("RLUDFBMESxyz")
)

func movesOf(letters string) []cube.Move {
	var ms []cube.Move
	for _, l := range []byte(letters) {
		for _, a := range []cube.Amount{cube.Clockwise, cube.Counterclockwise, cube.Half} {
			ms = append(ms, cube.Move{Letter: cube.Letter(l), Amount: a})
		}
	}
	return ms
}

func pick(r *rand.Rand, from []cube.Move, n int) string {
	ms := make([]cube.Move, n)
	for i := range ms {
		ms[i] = from[r.IntN(len(from))]
	}
	return cube.FormatMoves(ms)
}

// randomScramble is 25 random outer-Layer Turns.
func randomScramble(r *rand.Rand) string { return pick(r, outerTurns, 25) }

// randomHistory is up to 40 random Moves of every kind, including
// middle-Layer Turns and Cube rotations.
func randomHistory(r *rand.Rand) string { return pick(r, everyMove, r.IntN(41)) }

// randomRotations turns the Cube to face a random way.
func randomRotations(r *rand.Rand) string { return pick(r, movesOf("xyz"), r.IntN(4)) }

// crossKeepingMoves is a random sequence that keeps a white cross on top
// whole: bottom-Layer Turns, y rotations and the corner trigger R' D' R D,
// which takes the right edge out and puts it back.
func crossKeepingMoves(r *rand.Rand) string {
	var parts []string
	for range r.IntN(12) {
		parts = append(parts, []string{"D", "D'", "D2", "y", "y'", "y2", "R' D' R D", "D' R' D R"}[r.IntN(8)])
	}
	return strings.Join(parts, " ")
}
