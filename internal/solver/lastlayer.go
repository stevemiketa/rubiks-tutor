package solver

import (
	"strings"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Stages 4 to 7, the last layer. Each starts with white on the bottom, as
// Stage 3 leaves it, so the yellow layer is on top. Each repeats one
// Algorithm, setting it up with Turns of the top or rotations about y, until
// its goal holds; the Algorithms change only the top layer.

// Stage 4, the yellow cross. It counts the top edges with yellow facing up:
// none, two side by side (an L), two opposite (a line), or all four. It turns
// the top so a line goes from left to right, or an L is at the back and left,
// and does the edge flip, until all four face up: a line takes one, an L two,
// and none three.
var yellowCross = stageSpec{
	id:       "yellow-cross",
	name:     "Yellow cross",
	goal:     "Make a yellow cross on top.",
	pieces:   yellowEdgeNames,
	finished: lastLayerFinished(yellowCrossOnTop),
	solve:    solveYellowCross,
}

var edgeFlip = newAlgorithm("Edge flip", "F R U R' U' F'")

// yellowEdgeNames and yellowCornerNames name the last layer's Pieces.
var yellowEdgeNames, yellowCornerNames = yellowPieces(" edge"), yellowPieces(" corner")

func yellowPieces(kind string) []string {
	return pieceNamesWhere(func(name string) bool {
		return strings.HasPrefix(name, "yellow-") && strings.HasSuffix(name, kind)
	})
}

// lastLayerFinished returns a Stage's finished check for a last-layer Stage:
// with white turned to the bottom, the first two layers are done and done
// holds for the top.
func lastLayerFinished(done func(cube.Cube) bool) func(cube.Cube) bool {
	return func(c cube.Cube) bool {
		c = c.Apply(whiteRotations(c, whiteDownFrom)...)
		return firstTwoLayersOnBottom(c) && done(c)
	}
}

var (
	topEdges   = []string{"UF", "UR", "UB", "UL"}
	topCorners = []string{"UFR", "UFL", "UBR", "UBL"}
)

// yellowUp reports whether every top Slot named has yellow facing up.
func yellowUp(c cube.Cube, names ...string) bool { return countYellowUp(c, names) == len(names) }

// countYellowUp counts the top Slots named that have yellow facing up.
func countYellowUp(c cube.Cube, names []string) int {
	n := 0
	for _, name := range names {
		if c[slot(name).Stickers[0]] == cube.Yellow {
			n++
		}
	}
	return n
}

func yellowCrossOnTop(c cube.Cube) bool { return yellowUp(c, topEdges...) }

func solveYellowCross(b *builder) {
	putWhiteOnBottom(b)
	for range 3 {
		c := b.cube
		if yellowCrossOnTop(c) {
			return
		}
		if countYellowUp(c, topEdges) == 2 {
			if yellowUp(c, "UF", "UB") || yellowUp(c, "UL", "UR") {
				b.setUp('U', func(c cube.Cube) bool { return yellowUp(c, "UL", "UR") },
					"turn the top so the yellow line goes from left to right")
			} else {
				b.setUp('U', func(c cube.Cube) bool { return yellowUp(c, "UB", "UL") },
					"turn the top so the yellow L is at the back and left")
			}
		}
		b.use(edgeFlip)
	}
	if !yellowCrossOnTop(b.cube) {
		panic("solver: the edge flip did not make the yellow cross")
	}
}

// Stage 5, the yellow face. It counts the top corners with yellow facing up.
// With one, it turns the top so that corner is at front-left; with none, so
// the front-left corner has yellow facing left; with two, so the front-left
// corner has yellow facing the front. Then it does Sune, and looks again,
// until all four face up.
var yellowFace = stageSpec{
	id:       "yellow-face",
	name:     "Yellow face",
	goal:     "Twist the top corners until the whole top is yellow.",
	pieces:   yellowCornerNames,
	finished: lastLayerFinished(yellowFaceOnTop),
	solve:    solveYellowFace,
}

var sune = newAlgorithm("Sune", "R U R' U R U2 R'")

func yellowFaceOnTop(c cube.Cube) bool { return yellowCrossOnTop(c) && yellowUp(c, topCorners...) }

// frontLeftYellowOn reports whether the front-left corner's yellow Sticker
// is on face f.
func frontLeftYellowOn(c cube.Cube, f cube.Face) bool {
	for _, st := range slot("UFL").Stickers {
		if st.Face() == f {
			return c[st] == cube.Yellow
		}
	}
	return false
}

func solveYellowFace(b *builder) {
	putWhiteOnBottom(b)
	for range 3 {
		c := b.cube
		if yellowFaceOnTop(c) {
			return
		}
		switch countYellowUp(c, topCorners) {
		case 1:
			b.setUp('U', func(c cube.Cube) bool { return frontLeftYellowOn(c, cube.U) },
				"turn the top so the one corner with yellow on top is at front-left")
		case 0:
			b.setUp('U', func(c cube.Cube) bool { return frontLeftYellowOn(c, cube.L) },
				"turn the top so the front-left corner has yellow facing left")
		default:
			b.setUp('U', func(c cube.Cube) bool { return frontLeftYellowOn(c, cube.F) },
				"turn the top so the front-left corner has yellow facing the front")
		}
		b.use(sune)
	}
	if !yellowFaceOnTop(b.cube) {
		panic("solver: Sune did not make the yellow face")
	}
}

// Stage 6, the yellow corners. If a Turn of the top puts every top corner in
// place, it does that. Otherwise, if a Turn puts exactly one in place, it
// does that Turn (the one that needs fewer A-perms, if two do), rotates the
// Cube about y so that corner is at front-left, where the A-perm leaves it,
// and repeats the A-perm, which moves the other three round, until they are
// in place too. If no Turn puts exactly one in place, it does the A-perm
// first, from where it is, and looks again.
var yellowCorners = stageSpec{
	id:       "yellow-corners",
	name:     "Yellow corners",
	goal:     "Move the top corners to their correct spots.",
	pieces:   yellowCornerNames,
	finished: lastLayerFinished(func(c cube.Cube) bool { return yellowFaceOnTop(c) && topInPlace(c, topCorners) == 4 }),
	solve:    solveYellowCorners,
}

var aPerm = newAlgorithm("A-perm", "R' F R' B2 R F' R' B2 R2")

// topTurns are the ways to turn the top: not at all, a clockwise, a
// counterclockwise or a half Turn, in the order setUp tries them.
var topTurns = [][]cube.Move{nil, cube.MustParseMoves("U"), cube.MustParseMoves("U'"), cube.MustParseMoves("U2")}

// topInPlace counts the Pieces in the top Slots named that are in place.
func topInPlace(c cube.Cube, names []string) int {
	n := 0
	for _, name := range names {
		if inPlace(c, slot(name)) {
			n++
		}
	}
	return n
}

func solveYellowCorners(b *builder) {
	putWhiteOnBottom(b)
	allInPlace := func(c cube.Cube) bool { return topInPlace(c, topCorners) == 4 }
	for range 2 {
		var oneInPlace [][]cube.Move
		for _, turn := range topTurns {
			switch topInPlace(b.cube.Apply(turn...), topCorners) {
			case 4:
				b.setUp('U', allInPlace, "turn the top so the yellow corners are in place")
				return
			case 1:
				oneInPlace = append(oneInPlace, turn)
			}
		}
		if len(oneInPlace) > 0 {
			cycleCorners(b, oneInPlace[cheapest(b, oneInPlace, cycleCorners)])
			return
		}
		b.use(aPerm)
	}
	panic("solver: the A-perm did not put a yellow corner in place")
}

// cycleCorners turns the top by turn, which puts exactly one top corner in
// place, rotates the Cube so that corner is at front-left, and repeats the
// A-perm until the other three are in place.
func cycleCorners(b *builder, turn []cube.Move) {
	c := b.cube.Apply(turn...)
	var name string
	for _, s := range topCorners {
		if inPlace(c, slot(s)) {
			name, _ = c.PieceAt(s)
		}
	}
	for _, m := range turn {
		b.move(m, "turn the top so the "+name+" is in place")
	}
	frontLeft := slot("UFL")
	b.setUp('y', func(c cube.Cube) bool { p, _ := c.PieceAt(frontLeft.Name); return p == name },
		"rotate so the "+name+", which is in place, is at front-left")
	for range 2 {
		if topInPlace(b.cube, topCorners) == 4 {
			return
		}
		b.use(aPerm)
	}
	if topInPlace(b.cube, topCorners) != 4 {
		panic("solver: the A-perm did not put the yellow corners in place")
	}
}

// Stage 7, the yellow edges. With every corner in place, only the top edges
// are left. If one edge is in place, it rotates the Cube about y so that edge
// is at the back, where the U-perm leaves it, and repeats the U-perm, which
// moves the other three round, until they are in place too. If none is, it
// does the U-perm first, from where it is, which leaves one in place.
var yellowEdges = stageSpec{
	id:       "yellow-edges",
	name:     "Yellow edges",
	goal:     "Move the top edges to their correct spots to finish the Cube.",
	pieces:   yellowEdgeNames,
	finished: lastLayerFinished(func(c cube.Cube) bool { return c.IsSolved() }),
	solve:    solveYellowEdges,
}

var uPerm = newAlgorithm("U-perm", "R U' R U R U R U' R' U' R2")

func solveYellowEdges(b *builder) {
	putWhiteOnBottom(b)
	if b.cube.IsSolved() {
		return
	}
	if topInPlace(b.cube, topEdges) == 0 {
		b.use(uPerm)
	}
	var name string
	for _, s := range topEdges {
		if inPlace(b.cube, slot(s)) {
			name, _ = b.cube.PieceAt(s)
		}
	}
	b.setUp('y', func(c cube.Cube) bool { p, _ := c.PieceAt("UB"); return p == name },
		"rotate so the "+name+", which is in place, is at the back")
	for range 2 {
		if b.cube.IsSolved() {
			return
		}
		b.use(uPerm)
	}
	if !b.cube.IsSolved() {
		panic("solver: the U-perm did not put the yellow edges in place")
	}
}
