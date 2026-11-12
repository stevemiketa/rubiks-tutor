package solver

import (
	"strings"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Stage 3, the middle layer. It turns the Cube over so white is on the
// bottom, then puts the four middle-layer edges in one at a time, the one
// taking the fewest Moves first. For each edge on top, it rotates the Cube
// about y so the center matching the edge's side color is in front, turns the
// top to bring the edge above that center, and inserts it to the right or to
// the left, toward the center matching its top color. An edge in the middle
// layer in the wrong place, or flipped in its own, is first rotated to
// front-right and taken out with a right insert.
var middleEdges = stageSpec{
	id:   "middle-edges",
	name: "Middle layer",
	goal: "Rotate the Cube so white is on the bottom, then place the four middle-layer edges.",
	pieces: pieceNamesWhere(func(name string) bool {
		return strings.HasSuffix(name, " edge") && !strings.Contains(name, "white") && !strings.Contains(name, "yellow")
	}),
	finished: func(c cube.Cube) bool { return firstTwoLayersOnBottom(c.Apply(whiteRotations(c, whiteDownFrom)...)) },
	solve:    solveMiddleEdges,
}

var (
	rightInsert = newAlgorithm("Right insert", "U R U' R' U' F' U F")
	leftInsert  = newAlgorithm("Left insert", "U' L' U L U F U' F'")
)

// firstTwoLayersOnBottom reports whether every Piece of the bottom and middle
// layers is in place.
func firstTwoLayersOnBottom(c cube.Cube) bool {
	return allInPlace(c, func(s cube.Slot) bool { return s.Position[1] <= 0 })
}

func solveMiddleEdges(b *builder) {
	putWhiteOnBottom(b)
	todo := [][2]cube.Color{}
	for _, pair := range sidePairs {
		if !inPlace(b.cube, where(b.cube, pair[:])) {
			todo = append(todo, pair)
		}
	}
	for len(todo) > 0 {
		next := cheapest(b, todo, insertMiddleEdge)
		insertMiddleEdge(b, todo[next])
		todo = append(todo[:next], todo[next+1:]...)
	}
}

// insertMiddleEdge puts the middle-layer edge with these colors in place,
// with white on the bottom, leaving the first layer and the other
// middle-layer edges as they were.
func insertMiddleEdge(b *builder, pair [2]cube.Color) {
	colors := pair[:]
	name := "the " + colorNames(pair[0], pair[1]) + " edge"
	frontRight, upFront := slot("FR"), slot("UF")

	if at := where(b.cube, colors); at.Position[1] == 0 {
		note := "rotate so " + name + " is at front-right, to take it out of the wrong place"
		if belongsAt(b.cube, at, colors) {
			note = "rotate so " + name + ", flipped in its place, is at front-right, to take it out"
		}
		b.setUp('y', func(c cube.Cube) bool { return holds(c, frontRight, colors) }, note)
		b.use(rightInsert) // takes it up to the top layer
	}

	// The edge is on top: side is the color of its Sticker facing the side,
	// top the color of the one facing up.
	at := where(b.cube, colors)
	top, side := b.cube[at.Stickers[0]], b.cube[at.Stickers[1]]
	b.setUp('y', func(c cube.Cube) bool { return center(c, cube.F) == side },
		"rotate so the "+side.String()+" center is in front, for "+name)
	b.setUp('U', func(c cube.Cube) bool { return holds(c, upFront, colors) },
		"turn the top so "+name+" is above the "+side.String()+" center")
	insert, into := leftInsert, slot("FL")
	if center(b.cube, cube.R) == top {
		insert, into = rightInsert, frontRight
	}
	b.use(insert)
	if !inPlace(b.cube, into) {
		panic("solver: the " + insert.name + " did not put " + name + " in place")
	}
}
