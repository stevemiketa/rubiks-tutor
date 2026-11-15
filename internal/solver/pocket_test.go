package solver_test

import (
	"math/rand/v2"
	"slices"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/solver"
)

// The 2x2 Pocket Cube Solve path (issue #43, ADR 0005). A corners-only
// Scramble solves with only the three corner Stages of the beginner Method,
// its Moves are corner-only face Turns with no Cube rotation, and replaying
// them with ApplyPocket reaches a solved Pocket Cube.

// cornerStages are the three Stages a 2x2 Solution may contain, in order: the
// cross and edge Stages do no corner work and never appear.
var cornerStages = []string{"white-corners", "yellow-face", "yellow-corners"}

// scramblePocket builds a Pocket Cube from n random corner-only face Turns,
// returning the Cube and the Turns that made it.
func scramblePocket(r *rand.Rand, n int) cube.Cube {
	faces := []cube.Letter{'R', 'L', 'U', 'D', 'F', 'B'}
	amounts := []cube.Amount{cube.Clockwise, cube.Counterclockwise, cube.Half}
	c := cube.Solved()
	for range n {
		c = c.ApplyPocket(cube.Move{Letter: faces[r.IntN(len(faces))], Amount: amounts[r.IntN(len(amounts))]})
	}
	return c
}

// stageMoves returns a Stage's Moves.
func stageMoves(st solver.Stage) []cube.Move {
	ms := make([]cube.Move, len(st.Moves))
	for i, m := range st.Moves {
		ms[i] = m.Move
	}
	return ms
}

func TestPocketSolveUsesOnlyTheCornerStages(t *testing.T) {
	r := rand.New(rand.NewPCG(2026, 43))
	for range 500 {
		c := scramblePocket(r, 20)
		s := solver.Solve(c, cube.Pocket)
		if c.IsSolved() {
			if !s.Solved || s.Stages != nil {
				t.Fatalf("a solved Pocket Cube got solved=%v, %d Stages", s.Solved, len(s.Stages))
			}
			continue
		}
		if s.Solved {
			t.Fatalf("an unsolved Pocket Cube reported solved")
		}

		// The Stages are a suffix of the three corner Stages, in order: no
		// cross or edge Stage, and the Stages already finished are skipped.
		ids := stageIDs(s)
		if !isSuffixOf(ids, cornerStages) {
			t.Fatalf("Stages %v, want a suffix of %v", ids, cornerStages)
		}

		// No Stage Move is a Cube rotation, and replaying every Stage's Moves
		// with ApplyPocket solves the Pocket Cube.
		got := c
		for _, st := range s.Stages {
			for _, m := range stageMoves(st) {
				if m.IsRotation() {
					t.Fatalf("Stage %s has Cube rotation %v in its Moves %v", st.ID, m, stageMoves(st))
				}
			}
			got = got.ApplyPocket(stageMoves(st)...)
		}
		if !got.IsSolved() {
			t.Errorf("applying the Solution %v with ApplyPocket left the Cube unsolved: %v", ids, got)
		}
	}
}

func TestPocketSolveIsDeterministic(t *testing.T) {
	r := rand.New(rand.NewPCG(7, 7))
	for range 100 {
		c := scramblePocket(r, 20)
		a, b := solver.Solve(c, cube.Pocket), solver.Solve(c, cube.Pocket)
		if !slices.Equal(stageIDs(a), stageIDs(b)) {
			t.Fatalf("Stage IDs differ between solves of the same Cube: %v vs %v", stageIDs(a), stageIDs(b))
		}
		for i := range a.Stages {
			if !slices.Equal(stageMoves(a.Stages[i]), stageMoves(b.Stages[i])) {
				t.Fatalf("Stage %s Moves differ between solves: %v vs %v",
					a.Stages[i].ID, stageMoves(a.Stages[i]), stageMoves(b.Stages[i]))
			}
		}
	}
}

func TestPocketSolveReusesTheCornerAlgorithms(t *testing.T) {
	// A Pocket Cube with only the last layer left exercises Sune and the
	// A-perm; placing corners first exercises the corner trigger. Over many
	// Scrambles, every corner Stage that runs reports its own Algorithm by
	// name, and each Algorithm's Moves match the Stage's Moves at its Start.
	want := map[string]string{
		"white-corners":  "Corner trigger",
		"yellow-face":    "Sune",
		"yellow-corners": "A-perm",
	}
	seen := map[string]bool{}
	r := rand.New(rand.NewPCG(99, 1))
	for range 500 {
		c := scramblePocket(r, 20)
		s := solver.Solve(c, cube.Pocket)
		for _, st := range s.Stages {
			moves := stageMoves(st)
			for _, a := range st.Algorithms {
				if a.Name != want[st.ID] {
					t.Errorf("Stage %s used Algorithm %q, want %q", st.ID, a.Name, want[st.ID])
				}
				seen[a.Name] = true
				if a.Start < 0 || a.Start+len(a.Moves) > len(moves) ||
					!slices.Equal(moves[a.Start:a.Start+len(a.Moves)], a.Moves) {
					t.Errorf("Stage %s: Algorithm %q Moves %v are not at Start %d of %v",
						st.ID, a.Name, a.Moves, a.Start, moves)
				}
			}
		}
	}
	for _, name := range []string{"Corner trigger", "Sune", "A-perm"} {
		if !seen[name] {
			t.Errorf("no Solution over 500 Scrambles used the %s", name)
		}
	}
}

func stageIDs(s solver.Solution) []string {
	ids := make([]string, len(s.Stages))
	for i, st := range s.Stages {
		ids[i] = st.ID
	}
	return ids
}

// isSuffixOf reports whether got is a (possibly empty, possibly full) suffix
// of want: the same IDs in the same order, ending at want's last.
func isSuffixOf(got, want []string) bool {
	if len(got) > len(want) {
		return false
	}
	return slices.Equal(got, want[len(want)-len(got):])
}
