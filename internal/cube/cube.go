package cube

import (
	"fmt"
	"strings"
)

// Color is a Sticker color.
type Color uint8

// The six colors, in the order Piece names list them.
const (
	White Color = iota
	Yellow
	Green
	Blue
	Red
	Orange
)

const colorLetters = "WYGBRO"

var colorNames = [...]string{"white", "yellow", "green", "blue", "red", "orange"}

// String returns the color's name, such as "white".
func (c Color) String() string { return colorNames[c] }

// Letter returns the color's letter in a printed state, such as 'W'.
func (c Color) Letter() byte { return colorLetters[c] }

// Face is a side of the Cube by position, not color: U is whichever face is
// currently on top.
type Face uint8

// The six faces, in Sticker index order.
const (
	U Face = iota
	R
	F
	D
	L
	B
)

const faceLetters = "URFDLB"

// String returns the face's letter, such as "U".
func (f Face) String() string { return faceLetters[f : f+1] }

// Sticker indexes one of the 54 Stickers: face*9 + row*3 + col, as laid out
// in the package doc.
type Sticker int

// StickerAt returns the Sticker at a row and column (each 0 to 2) of a face.
func StickerAt(f Face, row, col int) Sticker { return Sticker(int(f)*9 + row*3 + col) }

// Face returns the face the Sticker is on.
func (s Sticker) Face() Face { return Face(s / 9) }

// Row returns the Sticker's row on its face, 0 to 2.
func (s Sticker) Row() int { return int(s) % 9 / 3 }

// Col returns the Sticker's column on its face, 0 to 2.
func (s Sticker) Col() int { return int(s) % 3 }

// String names the Sticker by face and position on it, such as "U7".
func (s Sticker) String() string { return fmt.Sprintf("%s%d", s.Face(), int(s)%9) }

// Cube is the color of each of the 54 Stickers as currently seen, indexed by
// Sticker. Cubes are values: Apply returns a new one, and == compares states.
type Cube [54]Color

// Solved returns a solved Cube in the standard orientation.
func Solved() Cube {
	var c Cube
	for s := range c {
		c[s] = solvedColor[Sticker(s).Face()]
	}
	return c
}

var solvedColor = [6]Color{U: White, R: Red, F: Green, D: Yellow, L: Orange, B: Blue}

// String prints the state as six space-separated groups of nine color
// letters, one per face in index order.
func (c Cube) String() string {
	var b strings.Builder
	for s, color := range c {
		if s > 0 && s%9 == 0 {
			b.WriteByte(' ')
		}
		b.WriteByte(color.Letter())
	}
	return b.String()
}

// ParseCube parses a state in the format String prints. It checks the format,
// not whether the state can be reached by Moves.
func ParseCube(state string) (Cube, error) {
	var c Cube
	groups := strings.Split(state, " ")
	if len(groups) != 6 {
		return c, fmt.Errorf("cube state %q: want 6 space-separated faces", state)
	}
	for f, group := range groups {
		if len(group) != 9 {
			return c, fmt.Errorf("cube state %q: face %s has %d Stickers, want 9", state, Face(f), len(group))
		}
		for i := range 9 {
			color := strings.IndexByte(colorLetters, group[i])
			if color < 0 {
				return c, fmt.Errorf("cube state %q: %q is not a color letter (%s)", state, group[i], colorLetters)
			}
			c[f*9+i] = Color(color)
		}
	}
	return c, nil
}

// Apply returns the Cube after the Moves, in order.
func (c Cube) Apply(moves ...Move) Cube {
	for _, m := range moves {
		c = permute(c, movePerm(m))
	}
	return c
}

// IsSolved reports whether every face is a single color, in any orientation.
func (c Cube) IsSolved() bool {
	for s := range c {
		if c[s] != c[s/9*9+4] {
			return false
		}
	}
	return true
}
