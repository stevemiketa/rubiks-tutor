package solver

import (
	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// What the Stages share for finding Pieces. Whether a Piece is in place, and
// where one is, are questions for the cube model: see cube.Cube.InPlace and
// cube.Cube.SlotOf.

var allSlots = cube.Slots()

// The Slots the Stages name. A misspelt name panics when the package loads.
var (
	slotUF, slotUR, slotUB, slotUL     = cube.MustSlot("UF"), cube.MustSlot("UR"), cube.MustSlot("UB"), cube.MustSlot("UL")
	slotFR, slotFL                     = cube.MustSlot("FR"), cube.MustSlot("FL")
	slotUFR, slotUFL, slotUBR, slotUBL = cube.MustSlot("UFR"), cube.MustSlot("UFL"), cube.MustSlot("UBR"), cube.MustSlot("UBL")
	slotDFR                            = cube.MustSlot("DFR")
)

// sidePairs are the four pairs of side colors that meet: the side colors of
// a white corner, and the colors of a middle-layer edge. Each pair is in
// Color order, the order Piece names list colors in.
var sidePairs = [][2]cube.Color{{cube.Green, cube.Red}, {cube.Green, cube.Orange}, {cube.Blue, cube.Red}, {cube.Blue, cube.Orange}}

// allInPlace reports whether every Piece in the Slots that in picks is in
// place.
func allInPlace(c cube.Cube, in func(cube.Slot) bool) bool {
	for _, s := range allSlots {
		if in(s) && !c.InPlace(s) {
			return false
		}
	}
	return true
}

// where returns the Slot that holds the Piece with these colors. Every Cube
// the solver is given has every Piece, so it panics if there is none.
func where(c cube.Cube, colors ...cube.Color) cube.Slot {
	s, ok := c.SlotOf(colors...)
	if !ok {
		panic("solver: the " + cube.PieceName(colors...) + " is missing from the Cube")
	}
	return s
}

// pieceNamesWhere lists the names of the Pieces that keep picks, in the
// order cube.PieceNames gives them.
func pieceNamesWhere(keep func(cube.Piece) bool) []string {
	var names []string
	for _, p := range cube.Pieces() {
		if keep(p) {
			names = append(names, p.Name)
		}
	}
	return names
}
