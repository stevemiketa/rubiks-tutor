// Package solver finds a Solution that follows the beginner's layer-by-layer
// Method (ADR 0001): a list of Stages, each with its goal, its Moves (with
// short notes), the Algorithms it uses and the Pieces it works on.
//
// Solving runs the Method's Stages in order as a pipeline. Each Stage starts
// from the Cube the earlier ones leave and appends its Moves through a
// builder. A Stage is skipped only if it and every earlier Stage are already
// finished. The same Cube always gets the same Solution.
package solver

import "github.com/stevemiketa/rubiks-tutor/internal/cube"

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

// method lists the Method's Stages in order. Stages 2-7 slot in here.
var method = []stageSpec{whiteCross}

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

// putWhiteOnTop appends the Cube rotations, if any, that bring the white
// center to the top. The first Stage that isn't skipped starts with it.
func putWhiteOnTop(b *builder) {
	for _, m := range whiteUpRotations(b.cube) {
		note := "rotate the Cube so the white center is on top"
		if m.Amount == cube.Half {
			note = "turn the Cube over so the white center is on top"
		}
		b.move(m, note)
	}
}

// whiteUpRotations returns the Cube rotations that bring the white center
// from wherever it is to the top: none, or one of x, x', x2, z, z'.
func whiteUpRotations(c cube.Cube) []cube.Move {
	for f := cube.U; f <= cube.B; f++ {
		if c[cube.StickerAt(f, 1, 1)] == cube.White {
			return cube.MustParseMoves(whiteUpFrom[f])
		}
	}
	panic("solver: the Cube has no white center")
}

// whiteUpFrom gives, for the face holding the white center, the Cube
// rotation that turns that face to the top.
var whiteUpFrom = [6]string{cube.U: "", cube.D: "x2", cube.F: "x", cube.B: "x'", cube.R: "z'", cube.L: "z"}
