package solver

import (
	"slices"
	"strings"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// What the Stages share for finding Pieces and telling whether they are in
// place. A Piece is in place when each of its Stickers matches the center of
// its face; the centers say where everything belongs, whichever way the Cube
// faces.

var allSlots = cube.Slots()

// slot returns the Slot with this name, such as "UFR".
func slot(name string) cube.Slot {
	i := slices.IndexFunc(allSlots, func(s cube.Slot) bool { return s.Name == name })
	if i < 0 {
		panic("solver: no Slot " + name)
	}
	return allSlots[i]
}

// sidePairs are the four pairs of side colors that meet: the side colors of
// a white corner, and the colors of a middle-layer edge. Each pair is in
// Color order, the order Piece names list colors in.
var sidePairs = [][2]cube.Color{{cube.Green, cube.Red}, {cube.Green, cube.Orange}, {cube.Blue, cube.Red}, {cube.Blue, cube.Orange}}

func center(c cube.Cube, f cube.Face) cube.Color { return c[cube.StickerAt(f, 1, 1)] }

// inPlace reports whether the Piece in s is in place.
func inPlace(c cube.Cube, s cube.Slot) bool {
	for _, st := range s.Stickers {
		if c[st] != center(c, st.Face()) {
			return false
		}
	}
	return true
}

// allInPlace reports whether every Piece in the Slots that in picks is in
// place.
func allInPlace(c cube.Cube, in func(cube.Slot) bool) bool {
	for _, s := range allSlots {
		if in(s) && !inPlace(c, s) {
			return false
		}
	}
	return true
}

// holds reports whether s holds the Piece with these colors, however it is
// turned.
func holds(c cube.Cube, s cube.Slot, colors []cube.Color) bool {
	return len(s.Stickers) == len(colors) && sameColors(len(colors), func(i int) cube.Color { return c[s.Stickers[i]] }, colors)
}

// belongsAt reports whether the Piece with these colors belongs in s: the
// centers of s's faces have its colors.
func belongsAt(c cube.Cube, s cube.Slot, colors []cube.Color) bool {
	return len(s.Stickers) == len(colors) &&
		sameColors(len(colors), func(i int) cube.Color { return center(c, s.Stickers[i].Face()) }, colors)
}

func sameColors(n int, color func(int) cube.Color, colors []cube.Color) bool {
	for i := range n {
		if !slices.Contains(colors, color(i)) {
			return false
		}
	}
	return true
}

// where returns the Slot that holds the Piece with these colors.
func where(c cube.Cube, colors []cube.Color) cube.Slot {
	for _, s := range allSlots {
		if holds(c, s, colors) {
			return s
		}
	}
	panic("solver: a Piece is missing from the Cube")
}

// pieceNamesWhere lists the names of the Pieces, as cube.PieceNames gives
// them, that keep picks.
func pieceNamesWhere(keep func(name string) bool) []string {
	var names []string
	for _, name := range cube.PieceNames() {
		if keep(name) {
			names = append(names, name)
		}
	}
	return names
}

// colorNames joins color names the way Piece names do, such as
// "white-green-red".
func colorNames(colors ...cube.Color) string {
	names := make([]string, len(colors))
	for i, c := range colors {
		names[i] = c.String()
	}
	return strings.Join(names, "-")
}
