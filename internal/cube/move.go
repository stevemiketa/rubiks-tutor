package cube

import (
	"fmt"
	"strings"
)

// Letter names what a Move turns: an outer Layer (R L U D F B), a middle Layer
// (M E S), or the whole Cube (x y z). Its value is the notation character.
type Letter byte

// Amount is how far a Move turns, in quarter turns clockwise as seen looking
// at the Layer's face (for M, E and S: the face of L, D and F; for x, y and z:
// the face of R, U and F).
type Amount int8

const (
	Clockwise        Amount = 1  // no suffix, as in R
	Half             Amount = 2  // suffix 2, as in R2
	Counterclockwise Amount = -1 // suffix ', as in R'
)

// Move is a single Turn or Cube rotation. The zero Move is invalid.
type Move struct {
	Letter Letter
	Amount Amount
}

// letters lists every valid Letter in notation order.
const letters = "RLUDFBMESxyz"

// String prints the Move in standard notation, such as R, R' or R2.
func (m Move) String() string {
	switch m.Amount {
	case Counterclockwise:
		return string(m.Letter) + "'"
	case Half:
		return string(m.Letter) + "2"
	default:
		return string(m.Letter)
	}
}

// Inverse returns the Move that undoes m: R' for R, R for R', and R2 for R2.
func (m Move) Inverse() Move {
	if m.Amount != Half {
		m.Amount = -m.Amount
	}
	return m
}

// Invert returns the sequence that undoes moves: each Move inverted, in
// reverse order.
func Invert(moves []Move) []Move {
	inverse := make([]Move, len(moves))
	for i, m := range moves {
		inverse[len(moves)-1-i] = m.Inverse()
	}
	return inverse
}

// IsRotation reports whether m is a Cube rotation (x, y or z) rather than a
// Turn.
func (m Move) IsRotation() bool { return m.Letter == 'x' || m.Letter == 'y' || m.Letter == 'z' }

// Relabel returns the Move that does physically what m did, once the Cube
// rotation rotation has been made: applying m then rotation gives the same
// Cube as applying rotation then m.Relabel(rotation). For example, F relabeled
// through y is L, because y brings the front Layer to the left. It panics if
// rotation is not a Cube rotation.
func (m Move) Relabel(rotation Move) Move {
	if !rotation.IsRotation() {
		panic(fmt.Sprintf("cube: relabeling through %v, which is not a Cube rotation", rotation))
	}
	return relabeled[moveIndex(rotation)][moveIndex(m)]
}

// relabeled[r][m] is allMoves[m] relabeled through allMoves[r]: the one Move
// with the same effect as undoing r, applying m, then applying r again.
var relabeled = func() [][]Move {
	table := make([][]Move, len(allMoves))
	var identity [54]Sticker
	for s := range identity {
		identity[s] = Sticker(s)
	}
	for ri, r := range allMoves {
		if !r.IsRotation() {
			continue
		}
		table[ri] = make([]Move, len(allMoves))
		for mi, m := range allMoves {
			want := permute(permute(permute(identity, movePerm(r.Inverse())), movePerm(m)), movePerm(r))
			for _, candidate := range allMoves {
				if permute(identity, movePerm(candidate)) == want {
					table[ri][mi] = candidate
				}
			}
		}
	}
	return table
}()

// ParseError reports the first invalid token in a Move sequence.
type ParseError struct {
	Token  string // the invalid token's text
	Offset int    // the 0-based character offset where the token starts
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("invalid Move %q at offset %d", e.Token, e.Offset)
}

// ParseMove parses one Move token, such as R, M' or x2.
func ParseMove(token string) (Move, error) {
	m, ok := parseToken(token)
	if !ok {
		return Move{}, &ParseError{Token: token}
	}
	return m, nil
}

func parseToken(token string) (Move, bool) {
	if len(token) == 0 || len(token) > 2 || !strings.ContainsRune(letters, rune(token[0])) {
		return Move{}, false
	}
	m := Move{Letter: Letter(token[0]), Amount: Clockwise}
	if len(token) == 2 {
		switch token[1] {
		case '\'':
			m.Amount = Counterclockwise
		case '2':
			m.Amount = Half
		default:
			return Move{}, false
		}
	}
	return m, true
}

// isSpace reports whether c separates Move tokens. Only ASCII whitespace
// does, so the TypeScript model splits a string at the same places.
func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

// ParseMoves parses a whitespace-separated Move sequence, such as
// "R U R' U'". An empty or all-whitespace string is an empty sequence. Wide
// Turns (r, Rw) and anything else outside the notation are rejected with a
// *ParseError for the first invalid token.
func ParseMoves(notation string) ([]Move, error) {
	moves := []Move{}
	for i := 0; i < len(notation); {
		if isSpace(notation[i]) {
			i++
			continue
		}
		start := i
		for i < len(notation) && !isSpace(notation[i]) {
			i++
		}
		m, ok := parseToken(notation[start:i])
		if !ok {
			// Every byte before start is ASCII (valid tokens and separators
			// are), so the byte offset is also the character offset.
			return nil, &ParseError{Token: notation[start:i], Offset: start}
		}
		moves = append(moves, m)
	}
	return moves, nil
}

// MustParseMoves is ParseMoves for notation known to be valid, such as an
// Algorithm written in the source. It panics on invalid notation.
func MustParseMoves(notation string) []Move {
	moves, err := ParseMoves(notation)
	if err != nil {
		panic(err)
	}
	return moves
}

// FormatMoves prints a Move sequence in standard notation, separated by
// single spaces.
func FormatMoves(moves []Move) string {
	parts := make([]string, len(moves))
	for i, m := range moves {
		parts[i] = m.String()
	}
	return strings.Join(parts, " ")
}
