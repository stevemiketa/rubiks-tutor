package solver

import (
	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Stage 2, the white corners. With white still on top, it puts the four
// white corners in one at a time, the one taking the fewest Moves first. For
// each, it rotates the Cube about y so the corner's place is at front-right,
// turns the bottom Layer to bring the corner below it, and repeats the corner
// trigger until the corner is in place. A corner on top in the wrong place,
// or twisted in its own, is first rotated to front-right: one corner trigger
// takes it out, and repeating it twists one in its place round.
var whiteCorners = stageSpec{
	id:       "white-corners",
	name:     "White corners",
	goal:     "Fill in the white corners to finish the first layer.",
	pieces:   pieceNamesWhere(func(p cube.Piece) bool { return p.IsCorner() && p.Has(cube.White) }),
	finished: func(c cube.Cube) bool { return firstLayerOnTop(c.Apply(whiteUpRotations(c)...)) },
	solve:    solveWhiteCorners,
}

var cornerTrigger = newAlgorithm("Corner trigger", "R' D' R D")

// firstLayerOnTop reports whether every Piece of the top layer is in place.
func firstLayerOnTop(c cube.Cube) bool {
	return allInPlace(c, func(s cube.Slot) bool { return s.Position[1] == 1 })
}

func solveWhiteCorners(b *builder) {
	putWhiteOnTop(b)
	todo := [][2]cube.Color{}
	for _, pair := range sidePairs {
		if !b.cube.InPlace(where(b.cube, whiteCorner(pair)...)) {
			todo = append(todo, pair)
		}
	}
	for len(todo) > 0 {
		next := cheapest(b, todo, insertWhiteCorner)
		insertWhiteCorner(b, todo[next])
		todo = append(todo[:next], todo[next+1:]...)
	}
}

func whiteCorner(pair [2]cube.Color) []cube.Color { return []cube.Color{cube.White, pair[0], pair[1]} }

// insertWhiteCorner puts the white corner with these side colors in place,
// with white on top, leaving the rest of the top layer as it was.
func insertWhiteCorner(b *builder, pair [2]cube.Color) {
	colors := whiteCorner(pair)
	name := cube.PieceName(colors...)
	frontRight, belowFrontRight := slotUFR, slotDFR
	placeAtFrontRight := func(c cube.Cube) bool { return c.BelongsAt(frontRight, colors...) }

	if at := where(b.cube, colors...); at.Position[1] == 1 {
		note := "rotate so the " + name + " is at front-right, to take it out of the wrong place"
		if b.cube.BelongsAt(at, colors...) {
			note = "rotate so the " + name + ", twisted in its place, is at front-right"
		}
		b.setUp('y', func(c cube.Cube) bool { return c.Holds(frontRight, colors...) }, note)
		if !placeAtFrontRight(b.cube) {
			b.use(cornerTrigger) // takes it down to the bottom layer
		}
	}
	b.setUp('y', placeAtFrontRight, "rotate so the "+name+"'s place is at front-right")
	b.setUp('D', func(c cube.Cube) bool { return c.Holds(belowFrontRight, colors...) || c.Holds(frontRight, colors...) },
		"turn the bottom so the "+name+" is below its place")
	for range 5 {
		if b.cube.InPlace(frontRight) {
			return
		}
		b.use(cornerTrigger)
	}
	if !b.cube.InPlace(frontRight) {
		panic("solver: the corner trigger did not put the " + name + " in place")
	}
}
