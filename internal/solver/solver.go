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
	Moves []SolutionMove
	// Algorithms lists each use of an Algorithm, in the order they occur.
	Algorithms []AlgorithmUse
	// Pieces names the Pieces the Stage works on, as cube.PieceNames does.
	Pieces []string
}

// SolutionMove is one Move of a Stage, with a short note when it isn't part
// of an Algorithm, such as "rotate so the unsolved corner is at front-right".
type SolutionMove struct {
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

// method2x2 is the Method for the Pocket Cube (ADR 0005): only the three
// Stages that do corner work. The cross and edge Stages do nothing on a 2x2 —
// its edges and centers are frozen phantoms — so they are left out rather than
// run to produce no Moves.
var method2x2 = []stageSpec{whiteCorners, yellowFace, yellowCorners}

// Solve returns the Solution for a Puzzle's Cube: the Cube with the whole
// beginner Method, the Pocket Cube with only its corner Stages. A Pocket Cube
// evolves under corner-only (2x2) Move semantics so its phantom edges and
// centers stay frozen, and its Solution holds only corner-only face Turns, with
// no Cube rotation (see [newBuilder]).
func Solve(c cube.Cube, puzzle cube.Puzzle) Solution {
	if c.IsSolved() {
		return Solution{Solved: true}
	}
	stages := []Stage{}
	// frame carries the Cube rotations made so far across Stages, so a Pocket
	// Cube's recorded Turns stay in one fixed frame: a later Stage starts from
	// the rotated working Cube the earlier ones leave, and rewrites its Turns
	// back through every rotation since the first Stage, not only its own.
	var frame []cube.Move
	for _, spec := range methodFor(puzzle) {
		if len(stages) == 0 && spec.finished(c) {
			continue
		}
		b := newBuilder(c, puzzle)
		b.frame = frame
		spec.solve(b)
		stages = append(stages, Stage{
			ID:         spec.id,
			Name:       spec.name,
			Goal:       spec.goal,
			Moves:      b.moves,
			Algorithms: b.algorithms,
			Pieces:     append([]string{}, spec.pieces...),
		})
		c = b.cube
		frame = b.frame
	}
	return Solution{Stages: stages}
}

// methodFor is the Method a Puzzle solves with.
func methodFor(puzzle cube.Puzzle) []stageSpec {
	if puzzle == cube.Pocket {
		return method2x2
	}
	return method
}

// builder collects one Stage's Moves while tracking the Cube they produce.
//
// On the Pocket Cube the Stages still reach for Cube rotations to position
// Pieces, but a 2x2 Solution must hold only corner-only face Turns. So a Pocket
// builder evolves its working Cube with pocket semantics (rotations keep the
// phantom centers and the corner frame together; face Turns freeze the
// phantoms), records no rotation, and rewrites every face Turn it records into
// the fixed frame — the Turn that has the same effect once the rotations so far
// are undone, via [cube.Move.Relabel]. Replaying the recorded Turns with
// [cube.Cube.ApplyPocket] from the original Cube then reaches the same solved
// state, with no rotation and the phantoms frozen throughout.
type builder struct {
	cube       cube.Cube
	moves      []SolutionMove
	algorithms []AlgorithmUse
	// pocket is set for a Pocket Cube Solve: it turns on the rewriting above.
	pocket bool
	// frame is the Cube rotations made so far, in order, when pocket is set.
	// A recorded Turn is relabeled back through these, newest first.
	frame []cube.Move
}

// newBuilder starts a builder for a Puzzle, from Cube c.
func newBuilder(c cube.Cube, puzzle cube.Puzzle) *builder {
	return &builder{cube: c, algorithms: []AlgorithmUse{}, pocket: puzzle == cube.Pocket}
}

// apply returns the Cube after one Move, under the builder's Puzzle semantics:
// pocket semantics for the Pocket Cube — a face Turn freezes the phantoms, a
// rotation turns the whole Cube — and ordinary semantics otherwise.
func (b *builder) apply(c cube.Cube, m cube.Move) cube.Cube {
	if b.pocket && !m.IsRotation() {
		return c.ApplyPocket(m)
	}
	return c.Apply(m)
}

// record appends m with its note, rewritten into the fixed frame for a Pocket
// Cube: a rotation is swallowed into the frame and recorded nothing; a face
// Turn is relabeled back through the frame so the recorded sequence holds no
// rotation. Off the Pocket Cube it records m unchanged.
func (b *builder) record(m cube.Move, note string) {
	if !b.pocket {
		b.moves = append(b.moves, SolutionMove{Move: m, Note: note})
		return
	}
	if m.IsRotation() {
		b.frame = append(b.frame, m)
		return
	}
	b.moves = append(b.moves, SolutionMove{Move: b.flatten(m), Note: note})
}

// flatten rewrites a face Turn into the fixed frame: the Turn with the same
// effect once the Cube rotations in frame are undone, so recorded Turns never
// depend on a rotation. It is the identity when no rotation has been made.
func (b *builder) flatten(m cube.Move) cube.Move {
	for i := len(b.frame) - 1; i >= 0; i-- {
		m = m.Relabel(b.frame[i].Inverse())
	}
	return m
}

// move appends a Move that isn't part of an Algorithm, with its note.
func (b *builder) move(m cube.Move, note string) {
	b.record(m, note)
	b.cube = b.apply(b.cube, m)
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
// record of where in the Stage's Moves they start. On the Pocket Cube the
// recorded Moves are the Algorithm's Moves rewritten into the fixed frame, so
// the Algorithm card matches what the Solution shows.
func (b *builder) use(a algorithm) {
	start := len(b.moves)
	recorded := make([]cube.Move, 0, len(a.moves))
	for _, m := range a.moves {
		b.record(m, "")
		recorded = append(recorded, b.moves[len(b.moves)-1].Move)
		b.cube = b.apply(b.cube, m)
	}
	b.algorithms = append(b.algorithms, AlgorithmUse{Name: a.name, Moves: recorded, Start: start})
}

// setUp appends the one Move of a letter, if any, that makes ready hold:
// none, a clockwise, a counterclockwise or a half Move, the first that works.
// Stages set up their Algorithms with it.
func (b *builder) setUp(letter cube.Letter, ready func(cube.Cube) bool, note string) {
	if ready(b.cube) {
		return
	}
	for _, amount := range []cube.Amount{cube.Clockwise, cube.Counterclockwise, cube.Half} {
		if m := (cube.Move{Letter: letter, Amount: amount}); ready(b.apply(b.cube, m)) {
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
		// The trial mirrors b's Puzzle semantics and current frame, so a
		// Pocket Cube trial counts and rewrites Moves the same way b would.
		trial := &builder{cube: b.cube, pocket: b.pocket, frame: slices.Clone(b.frame)}
		do(trial, item)
		if cost := len(trial.moves); best < 0 || cost < bestCost {
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
