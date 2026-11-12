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

		// Playing the first k Stages, then solving again, skips exactly the
		// Stages finished by then: those k, and any later ones they happen
		// to finish too, such as a middle layer that the white corners
		// complete.
		played := history
		for k, st := range s.Stages {
			played = join(played, st.Moves)
			rest := timer.solve(t, h, scramble, played)
			checkSolution(t, scramble, played, rest)
			later, c := s.Stages[k+1:], cubeAfter(scramble, played)
			for len(later) > 0 && finishedAnywhere(method[methodIndex(later[0].ID)], c) {
				later = later[1:]
			}
			if got, want := stageIDs(rest), stageIDs(solutionBody{Stages: later}); !slices.Equal(got, want) {
				t.Errorf("solving %q then %q after playing %d Stage(s): got Stages %v, want %v",
					scramble, history, k+1, got, want)
			}
		}
	}
	timer.check(t)
}

func TestSolveSkipsStagesThatAreAlreadyFinished(t *testing.T) {
	h := newTestServer(t)
	for n, tc := range []struct {
		through string // the last of the Stages finished
		// keep are Move sequences that keep every Stage through it finished,
		// with white on top: bottom-Layer Turns, y rotations, and Algorithms
		// that change only what the later Stages work on.
		keep []string
	}{
		// The corner trigger takes the right edge out and puts it back.
		{"white-cross", []string{"D", "D'", "D2", "y", "y'", "y2", "R' D' R D", "D' R' D R"}},
		// The inserts, done with white on the bottom.
		{"white-corners", []string{"D", "D'", "D2", "y", "y'", "y2", "x2 U R U' R' U' F' U F x2", "x2 U' L' U L U F U' F' x2"}},
		// The yellow Stages' Algorithms, done with white on the bottom.
		{"middle-edges", []string{
			"D", "D'", "D2", "y", "y'", "y2", "x2 F R U R' U' F' x2", "x2 R U R' U R U2 R' x2",
			"x2 R' F R' B2 R F' R' B2 R2 x2", "x2 R U' R U R U R U' R' U' R2 x2",
		}},
	} {
		t.Run(tc.through, func(t *testing.T) {
			timer := &solveTimer{}
			r := rand.New(rand.NewPCG(*solveSeed, uint64(1+n)))
			finished := method[:methodIndex(tc.through)+1]

			for range propertyCases {
				// A Cube with those Stages finished: built from a solved one
				// by Moves that keep them, or from a scrambled one by its own
				// Solution's first Stages. Either way the Cube is then turned
				// to face a random way.
				scramble, history := "", ""
				if r.IntN(2) == 0 {
					scramble, history = randomScramble(r), randomHistory(r)
					for _, st := range timer.solve(t, h, scramble, history).Stages {
						if methodIndex(st.ID) < len(finished) {
							history = join(history, st.Moves)
						}
					}
				}
				history = join(history, whiteUp(cubeAfter(scramble, history)), keeping(r, tc.keep), randomRotations(r))
				c := cubeAfter(scramble, history)
				for _, st := range finished {
					if !finishedAnywhere(st, c) {
						t.Fatalf("the test built %q then %q, whose Stage %s isn't finished", scramble, history, st.id)
					}
				}

				s := timer.solve(t, h, scramble, history)
				for _, st := range finished {
					if slices.Contains(stageIDs(s), st.id) {
						t.Errorf("solving %q then %q, whose Stage %s is finished: got Stages %v", scramble, history, st.id, stageIDs(s))
					}
				}
				checkSolution(t, scramble, history, s)
			}
			timer.check(t)
		})
	}
}

// checkSolution checks a Solution against the Method: the Method's Stages in
// order from the first one that isn't finished, each goal met at the end of
// its Stage, the Stage's own Algorithms where they say they are, the white
// center where the Stage wants it after its opening Cube rotations, only the
// Stage's setup Moves outside its Algorithms, and a note on each of those.
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

	// A Stage is skipped only if it and every earlier Stage are finished.
	if !s.Solved {
		first := slices.IndexFunc(method, func(st methodStage) bool { return !finishedAnywhere(st, c) })
		if first < 0 {
			first = len(method)
		}
		want := []string{}
		for _, st := range method[first:] {
			want = append(want, st.id)
		}
		if got := stageIDs(s); !slices.Equal(got, want) {
			t.Errorf("%s: got Stages %v, want %v", input, got, want)
		}
	}

	for _, st := range s.Stages {
		i := methodIndex(st.ID)
		if i < 0 {
			t.Errorf("%s: unknown Stage %q", input, st.ID)
			return
		}

		moves := st.moves(t)
		inAlgorithm := make([]bool, len(moves))
		for _, a := range st.Algorithms {
			notation, err := cube.ParseMoves(a.Notation)
			if err != nil || a.Start < 0 || a.Length != len(notation) || a.Start+a.Length > len(moves) ||
				!slices.Equal(moves[a.Start:a.Start+a.Length], notation) {
				t.Errorf("%s: Stage %s: Algorithm %+v does not match its Moves %q", input, st.ID, a, st.Moves)
				continue
			}
			if method[i].algorithms[a.Name] != a.Notation {
				t.Errorf("%s: Stage %s uses Algorithm %q %q, which isn't one of its own", input, st.ID, a.Name, a.Notation)
			}
			for j := range a.Length {
				inAlgorithm[a.Start+j] = true
			}
		}

		opened := c
		j := 0
		for ; j < len(moves) && moves[j].IsRotation() && !inAlgorithm[j]; j++ {
			opened = opened.Apply(moves[j])
		}
		if opened[cube.StickerAt(method[i].whiteOn, 1, 1)] != cube.White {
			t.Errorf("%s: Stage %s: the white center isn't on %v after the opening Cube rotations of %q", input, st.ID, method[i].whiteOn, st.Moves)
		}
		for ; j < len(moves); j++ {
			if !inAlgorithm[j] && !method[i].setup(moves[j]) {
				t.Errorf("%s: Stage %s: Move %d (%v) of %q is outside its Algorithms and isn't one of its setup Moves", input, st.ID, j, moves[j], st.Moves)
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

// keeping is up to 11 of the sequences in keep, picked at random.
func keeping(r *rand.Rand, keep []string) string {
	var parts []string
	for range r.IntN(12) {
		parts = append(parts, keep[r.IntN(len(keep))])
	}
	return join(parts...)
}

// whiteUp is the Cube rotation, if any, that turns the white center to the
// top.
func whiteUp(c cube.Cube) string {
	for _, turn := range []string{"", "x", "x'", "x2", "z", "z'"} {
		if c.Apply(cube.MustParseMoves(turn)...)[cube.StickerAt(cube.U, 1, 1)] == cube.White {
			return turn
		}
	}
	panic("the Cube has no white center")
}

func cubeAfter(scramble, history string) cube.Cube {
	return cube.Solved().Apply(cube.MustParseMoves(scramble + " " + history)...)
}

// join joins Move sequences in notation, leaving out empty ones.
func join(notation ...string) string {
	return strings.Join(slices.DeleteFunc(notation, func(s string) bool { return s == "" }), " ")
}
