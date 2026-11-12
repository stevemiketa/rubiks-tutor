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
