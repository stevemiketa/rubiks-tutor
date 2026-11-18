package cube

// Puzzle is which twisty Puzzle a Session, a Snapshot or a Solve is for
// (ADR 0005). The zero value is the Cube, so a value that never set a Puzzle,
// and an older Snapshot stored before 2x2 support, both read as the Cube.
type Puzzle int

const (
	// Cube3x3 is the 3x3x3 Cube, the default Puzzle.
	Cube3x3 Puzzle = iota
	// Pocket is the 2x2x2 Pocket Cube, solved corners-only over the same
	// [54]Color model with its edges and centers frozen (ADR 0005).
	Pocket
)

// puzzleTags is each Puzzle's wire tag, the string carried in a solve request
// and a Snapshot body. A missing or empty tag reads as the Cube.
var puzzleTags = [...]string{Cube3x3: "3x3", Pocket: "2x2"}

// String returns the Puzzle's wire tag, such as "3x3" or "2x2".
func (p Puzzle) String() string {
	if int(p) < 0 || int(p) >= len(puzzleTags) {
		return "3x3"
	}
	return puzzleTags[p]
}

// ParsePuzzle returns the Puzzle a wire tag names: "3x3" the Cube, "2x2" the
// Pocket Cube, and the empty string the Cube, so a request or a Snapshot that
// omits the type is the Cube. Any other tag is reported with ok false.
func ParsePuzzle(tag string) (p Puzzle, ok bool) {
	switch tag {
	case "", "3x3":
		return Cube3x3, true
	case "2x2":
		return Pocket, true
	default:
		return Cube3x3, false
	}
}
