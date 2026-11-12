package cube

import (
	"fmt"
	"slices"
	"strings"
)

// Slot is one of the 26 places a Piece can be, named by the faces it touches
// in the order U/D, F/B, R/L, such as "U", "UF" or "UFR".
type Slot struct {
	Name     string
	Stickers []Sticker // the Slot's Sticker on each face in Name, in that order
	Position [3]int    // x toward R, y toward U, z toward F; each -1, 0 or 1
}

// slotNames lists every Slot: the centers in face order, then the edges, then
// the corners.
var slotNames = []string{
	"U", "R", "F", "D", "L", "B",
	"UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL",
	"UFR", "UFL", "UBR", "UBL", "DFR", "DFL", "DBR", "DBL",
}

var slots = func() []Slot {
	all := make([]Slot, len(slotNames))
	for i, name := range slotNames {
		var pos vec
		faces := make([]Face, len(name))
		for j := range name {
			faces[j] = Face(strings.IndexByte(faceLetters, name[j]))
			pos = pos.add(faceFrames[faces[j]].normal)
		}
		stickers := make([]Sticker, len(faces))
		for j, f := range faces {
			stickers[j] = stickerAtPlace[stickerPlace{pos, faceFrames[f].normal}]
		}
		all[i] = Slot{Name: name, Stickers: stickers, Position: pos}
	}
	return all
}()

// Slots returns all 26 Slots, centers first in face order, then edges
// (UF UR UB UL DF DR DB DL FR FL BR BL), then corners
// (UFR UFL UBR UBL DFR DFL DBR DBL).
func Slots() []Slot {
	out := make([]Slot, len(slots))
	for i, s := range slots {
		s.Stickers = slices.Clone(s.Stickers)
		out[i] = s
	}
	return out
}

func slotByName(name string) (Slot, bool) {
	i := slices.Index(slotNames, name)
	if i < 0 {
		return Slot{}, false
	}
	return slots[i], true
}

// pieceName names the Piece with these Sticker colors: the colors in Color
// order, then its kind.
func pieceName(colors []Color) string {
	sorted := slices.Clone(colors)
	slices.Sort(sorted)
	names := make([]string, len(sorted))
	for i, c := range sorted {
		names[i] = c.String()
	}
	kind := [...]string{1: "center", 2: "edge", 3: "corner"}[len(sorted)]
	return strings.Join(names, "-") + " " + kind
}

var pieceNames = func() []string {
	solved := Solved()
	names := make([]string, len(slots))
	for i, slot := range slots {
		names[i] = pieceName(solved.colorsAt(slot))
	}
	return names
}()

// PieceNames returns the names of all 26 Pieces, in Slots order: the Piece
// each Slot holds in a solved Cube in the standard orientation.
func PieceNames() []string { return slices.Clone(pieceNames) }

func (c Cube) colorsAt(slot Slot) []Color {
	colors := make([]Color, len(slot.Stickers))
	for i, s := range slot.Stickers {
		colors[i] = c[s]
	}
	return colors
}

// PieceAt names the Piece currently in a Slot, such as "white-green edge" in
// "UF" of a solved Cube. It fails for an unknown Slot, or if the Slot's
// Stickers don't form a real Piece, which only happens for a state that no
// Moves can reach.
func (c Cube) PieceAt(slotName string) (string, error) {
	slot, ok := slotByName(slotName)
	if !ok {
		return "", fmt.Errorf("cube: unknown Slot %q", slotName)
	}
	name := pieceName(c.colorsAt(slot))
	if !slices.Contains(pieceNames, name) {
		return "", fmt.Errorf("cube: Slot %s holds no real Piece (%s)", slotName, name)
	}
	return name, nil
}

// Location is where a Piece currently is.
type Location struct {
	Slot     string    // the Slot's name, such as "UFR"
	Stickers []Sticker // the Sticker each of the Piece's colors is on, in the order its name lists them
}

// Locate finds a Piece by name, such as "white-green-red corner". Names must
// be exactly as PieceNames returns them.
func (c Cube) Locate(piece string) (Location, error) {
	if !slices.Contains(pieceNames, piece) {
		return Location{}, fmt.Errorf("cube: unknown Piece %q", piece)
	}
	for _, slot := range slots {
		colors := c.colorsAt(slot)
		if pieceName(colors) != piece {
			continue
		}
		sorted := slices.Clone(colors)
		slices.Sort(sorted)
		stickers := make([]Sticker, len(sorted))
		for i, color := range sorted {
			stickers[i] = slot.Stickers[slices.Index(colors, color)]
		}
		return Location{Slot: slot.Name, Stickers: stickers}, nil
	}
	return Location{}, fmt.Errorf("cube: Piece %q is not on this Cube", piece)
}

// The rest of this file is for the Go solver only. None of it changes Moves
// or notation, so the TypeScript model has no twin of it (ADR 0002).

// MustSlot returns the Slot with this name, such as "UFR". It panics if there
// is none, so use it for Slots named in source, as MustParseMoves is for
// Moves.
func MustSlot(name string) Slot {
	s, ok := slotByName(name)
	if !ok {
		panic(fmt.Sprintf("cube: unknown Slot %q", name))
	}
	s.Stickers = slices.Clone(s.Stickers)
	return s
}

// Piece is one of the 26 Pieces, known by its colors.
type Piece struct {
	Name   string  // as PieceNames gives it, such as "white-green-red corner"
	Colors []Color // its Stickers' colors, in Color order, as Name lists them
}

// Pieces returns all 26 Pieces, in Slots order, as PieceNames names them.
func Pieces() []Piece {
	solved := Solved()
	pieces := make([]Piece, len(slots))
	for i, slot := range slots {
		colors := solved.colorsAt(slot)
		slices.Sort(colors)
		pieces[i] = Piece{Name: pieceNames[i], Colors: colors}
	}
	return pieces
}

// Has reports whether one of the Piece's Stickers is color c.
func (p Piece) Has(c Color) bool { return slices.Contains(p.Colors, c) }

// IsEdge reports whether the Piece is an edge, with two Stickers.
func (p Piece) IsEdge() bool { return len(p.Colors) == 2 }

// IsCorner reports whether the Piece is a corner, with three Stickers.
func (p Piece) IsCorner() bool { return len(p.Colors) == 3 }

// PieceName names the Piece with these colors, given in any order, such as
// "white-green-red corner".
func PieceName(colors ...Color) string { return pieceName(colors) }

// Center returns the color of the center Sticker on face f.
func (c Cube) Center(f Face) Color { return c[StickerAt(f, 1, 1)] }

// InPlace reports whether the Piece in Slot s is in place: each of its
// Stickers matches the center of the face it is on. The centers say where
// every Piece belongs, whichever way the Cube faces.
func (c Cube) InPlace(s Slot) bool {
	for _, st := range s.Stickers {
		if c[st] != c.Center(st.Face()) {
			return false
		}
	}
	return true
}

// Holds reports whether Slot s holds the Piece with these colors, however it
// is twisted.
func (c Cube) Holds(s Slot, colors ...Color) bool {
	return len(s.Stickers) == len(colors) && sameColors(len(colors), func(i int) Color { return c[s.Stickers[i]] }, colors)
}

// BelongsAt reports whether the Piece with these colors belongs in Slot s:
// the centers of the faces s touches have its colors.
func (c Cube) BelongsAt(s Slot, colors ...Color) bool {
	return len(s.Stickers) == len(colors) &&
		sameColors(len(colors), func(i int) Color { return c.Center(s.Stickers[i].Face()) }, colors)
}

// sameColors reports whether each of the n colors color gives is one of
// colors.
func sameColors(n int, color func(int) Color, colors []Color) bool {
	for i := range n {
		if !slices.Contains(colors, color(i)) {
			return false
		}
	}
	return true
}

// SlotOf returns the Slot that holds the Piece with these colors, given in
// any order. ok is false if none does, which only happens for colors that
// name no Piece, or a state no Moves can reach.
func (c Cube) SlotOf(colors ...Color) (s Slot, ok bool) {
	for _, slot := range slots {
		if c.Holds(slot, colors...) {
			slot.Stickers = slices.Clone(slot.Stickers)
			return slot, true
		}
	}
	return Slot{}, false
}
