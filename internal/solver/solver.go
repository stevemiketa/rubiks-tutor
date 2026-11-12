// Package solver finds a Solution that follows the beginner's layer-by-layer
// Method (ADR 0001): a list of Stages, each with its goal, its Moves (with
// short notes), the Algorithms it uses and the Pieces it works on.
//
// Solving runs the Method's Stages in order as a pipeline. Each Stage starts
// from the Cube the earlier ones leave and appends its Moves through a
// builder. A Stage is skipped only if it and every earlier Stage are already
// finished. The same Cube always gets the same Solution.
package solver

import (
	"slices"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Solution is what Solve returns: either Solved, or the Stages that solve the
// Cube, in Method order.
type Solution struct {
	// Solved reports that the Cube was already solved; Stages is then nil.
	Solved bool
	Stages []Stage
}

// Stage is one Stage of the Method as it applies to a particular Cube.
type Stage struct {
	ID   string // stable, such as "white-cross"
	Name string // such as "White cross"
	Goal string // one sentence
	// Moves are the Stage's Moves in order, starting from the Cube the
	// earlier Stages leave.
	Moves []Step
	// Algorithms lists each use of an Algorithm, in the order they occur.
	Algorithms []AlgorithmUse
	// Pieces names the Pieces the Stage works on, as cube.PieceNames does.
	Pieces []string
}

// Step is one Move of a Stage, with a short note when it isn't part of an
// Algorithm, such as "rotate so the unsolved corner is at front-right".
type Step struct {
	Move cube.Move
	Note string // empty for no note
}

// AlgorithmUse is one use of a named Algorithm within a Stage: its Moves are
// the Stage's Moves[Start : Start+len(Moves)].
type AlgorithmUse struct {
	Name  string
	Moves []cube.Move
	Start int
}

// stageSpec is one Stage of the Method: what it is, how to tell it is
// finished, and how to do it.
type stageSpec struct {
	id, name, goal string
	pieces         []string
	// finished reports whether the Stage's goal already holds, wherever the
	// Cube is turned to face. Solve skips a finished Stage if every earlier
	// one is finished too.
	finished func(cube.Cube) bool
	// solve appends the Stage's Moves to b, starting from b.cube, and leaves
	// b.cube with the Stage's goal met.
	solve func(b *builder)
}

// method lists the Method's Stages in order.
var method = []stageSpec{whiteCross, whiteCorners, middleEdges, yellowCross, yellowFace, yellowCorners, yellowEdges}

// Solve returns the Solution for a Cube.
func Solve(c cube.Cube) Solution {
	if c.IsSolved() {
		return Solution{Solved: true}
	}
	stages := []Stage{}
	for _, spec := range method {
		if len(stages) == 0 && spec.finished(c) {
			continue
		}
		b := &builder{cube: c, algorithms: []AlgorithmUse{}}
		spec.solve(b)
		stages = append(stages, Stage{
			ID:         spec.id,
			Name:       spec.name,
			Goal:       spec.goal,
			Moves:      b.steps,
			Algorithms: b.algorithms,
			Pieces:     append([]string{}, spec.pieces...),
		})
		c = b.cube
	}
	return Solution{Stages: stages}
}

// builder collects one Stage's Moves while tracking the Cube they produce.
type builder struct {
	cube       cube.Cube
	steps      []Step
	algorithms []AlgorithmUse
}

// move appends a Move that isn't part of an Algorithm, with its note.
func (b *builder) move(m cube.Move, note string) {
	b.steps = append(b.steps, Step{Move: m, Note: note})
	b.cube = b.cube.Apply(m)
}

// algorithm is one of the Method's named Algorithms.
type algorithm struct {
	name  string
	moves []cube.Move
}

func newAlgorithm(name, notation string) algorithm {
	return algorithm{name: name, moves: cube.MustParseMoves(notation)}
}

// use appends one use of an Algorithm: its Moves, which get no notes, and a
// record of where in the Stage's Moves they start.
func (b *builder) use(a algorithm) {
	b.algorithms = append(b.algorithms, AlgorithmUse{Name: a.name, Moves: slices.Clone(a.moves), Start: len(b.steps)})
	for _, m := range a.moves {
		b.steps = append(b.steps, Step{Move: m})
	}
	b.cube = b.cube.Apply(a.moves...)
}

// setUp appends the one Move of a letter, if any, that makes ready hold:
// none, a clockwise, a counterclockwise or a half Move, the first that works.
// Stages set up their Algorithms with it.
func (b *builder) setUp(letter cube.Letter, ready func(cube.Cube) bool, note string) {
	if ready(b.cube) {
		return
	}
	for _, amount := range []cube.Amount{cube.Clockwise, cube.Counterclockwise, cube.Half} {
		if m := (cube.Move{Letter: letter, Amount: amount}); ready(b.cube.Apply(m)) {
			b.move(m, note)
			return
		}
	}
	panic("solver: no " + string(rune(letter)) + " Move sets up " + note)
}

// cheapest returns the index of the item for which do appends the fewest
// Moves, starting from b.cube, or the first of them on a tie. b is left as it
// was. Stages use it to do the easiest Piece next.
func cheapest[T any](b *builder, items []T, do func(*builder, T)) int {
	best, bestCost := -1, 0
	for i, item := range items {
		trial := &builder{cube: b.cube}
		do(trial, item)
		if cost := len(trial.steps); best < 0 || cost < bestCost {
			best, bestCost = i, cost
		}
	}
	return best
}

// putWhiteOnTop appends the Cube rotations, if any, that bring the white
// center to the top. Stages 1 and 2 start with it, so the first of them that
// isn't skipped turns white to the top.
func putWhiteOnTop(b *builder) { putWhite(b, whiteUpFrom, "on top") }

// putWhiteOnBottom appends the Cube rotations, if any, that bring the white
// center to the bottom. Stage 3 and later start with it: after Stage 2 it is
// the x2 that turns the Cube over.
func putWhiteOnBottom(b *builder) { putWhite(b, whiteDownFrom, "on the bottom") }

func putWhite(b *builder, from [6]string, where string) {
	for _, m := range whiteRotations(b.cube, from) {
		note := "rotate the Cube so the white center is " + where
		if m.Amount == cube.Half {
			note = "turn the Cube over so the white center is " + where
		}
		b.move(m, note)
	}
}

// whiteUpRotations returns the Cube rotations that bring the white center
// from wherever it is to the top: none, or one of x, x', x2, z, z'.
func whiteUpRotations(c cube.Cube) []cube.Move { return whiteRotations(c, whiteUpFrom) }

// whiteRotations returns the Cube rotation that from gives for the face
// holding the white center.
func whiteRotations(c cube.Cube, from [6]string) []cube.Move {
	for f := cube.U; f <= cube.B; f++ {
		if c[cube.StickerAt(f, 1, 1)] == cube.White {
			return cube.MustParseMoves(from[f])
		}
	}
	panic("solver: the Cube has no white center")
}

// whiteUpFrom and whiteDownFrom give, for the face holding the white center,
// the Cube rotation that turns that face to the top or to the bottom.
var (
	whiteUpFrom   = [6]string{cube.U: "", cube.D: "x2", cube.F: "x", cube.B: "x'", cube.R: "z'", cube.L: "z"}
	whiteDownFrom = [6]string{cube.U: "x2", cube.D: "", cube.F: "x'", cube.B: "x", cube.R: "z", cube.L: "z'"}
)
