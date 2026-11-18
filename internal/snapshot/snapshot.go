// Package snapshot defines Snapshots, the frozen copies of a Session that
// share links point to, and the Store that keeps them (ADR 0003, ADR 0004).
//
// A Snapshot is stored as its body: a canonical, versioned serialization.
// Its ID is the first [IDLength] characters of the URL-safe base64 SHA-256 of
// the body, so the same Snapshot always gets the same ID. When an ID is
// already taken by a different body, the next longer prefix of the hash is
// tried, until one is free or holds the same body: see [IDs].
package snapshot

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// MaxMoves is the most Moves a Snapshot holds, Scramble and Move history
// together.
const MaxMoves = 10_000

// IDLength is the length of an ID when no other Snapshot's ID starts the
// same way.
const IDLength = 10

// The ways a Snapshot can be invalid. [New] and [Parse] return errors that
// wrap one of these.
var (
	ErrInvalidNotation = errors.New("invalid notation")
	ErrInvalidScramble = errors.New("a Scramble may contain only outer-Layer Turns")
	ErrTooManyMoves    = errors.New("too many Moves")
)

// ErrNotFound is what [Store.Load] returns, wrapped, for an ID that names no
// Snapshot.
var ErrNotFound = errors.New("snapshot not found")

// Puzzle is which twisty Puzzle a Snapshot is for, re-exported from the cube
// model (ADR 0005). The zero value is the Cube.
type Puzzle = cube.Puzzle

// The Puzzles, re-exported so callers of this package need not import cube
// only to name one.
const (
	Cube3x3 = cube.Cube3x3
	Pocket  = cube.Pocket
)

// Snapshot is a Scramble, the Move history made after it, and the Puzzle it is
// for. Use [New], [NewFor], [Parse] or [ParseFor] to make one; the zero
// Snapshot is valid and empty, and for the Cube.
type Snapshot struct {
	scramble []cube.Move
	moves    []cube.Move
	puzzle   cube.Puzzle
}

// New returns the Cube Snapshot of a Scramble and a Move history. The Scramble
// may contain only outer-Layer Turns, and the two together at most
// [MaxMoves] Moves.
func New(scramble, moves []cube.Move) (Snapshot, error) {
	return NewFor(scramble, moves, Cube3x3)
}

// NewFor returns the Snapshot of a Scramble and a Move history for a Puzzle,
// validated as [New] does.
func NewFor(scramble, moves []cube.Move, puzzle Puzzle) (Snapshot, error) {
	for i, m := range scramble {
		if !isOuterTurn(m) {
			return Snapshot{}, fmt.Errorf("%w: Move %d of the Scramble is %v", ErrInvalidScramble, i+1, m)
		}
	}
	if n := len(scramble) + len(moves); n > MaxMoves {
		return Snapshot{}, fmt.Errorf("%w: %d Moves, more than the %d a Snapshot can hold", ErrTooManyMoves, n, MaxMoves)
	}
	return Snapshot{scramble: scramble, moves: moves, puzzle: puzzle}, nil
}

// Parse returns the Cube Snapshot of a Scramble and a Move history written in
// standard notation, validated as [New] does. Invalid notation gives an
// error wrapping both [ErrInvalidNotation] and the [*cube.ParseError].
func Parse(scramble, moves string) (Snapshot, error) {
	return ParseFor(scramble, moves, Cube3x3)
}

// ParseFor returns the Snapshot of a Scramble and a Move history in standard
// notation, for a Puzzle, validated as [NewFor] does.
func ParseFor(scramble, moves string, puzzle Puzzle) (Snapshot, error) {
	s, err := cube.ParseMoves(scramble)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: scramble: %w", ErrInvalidNotation, err)
	}
	m, err := cube.ParseMoves(moves)
	if err != nil {
		return Snapshot{}, fmt.Errorf("%w: moves: %w", ErrInvalidNotation, err)
	}
	return NewFor(s, m, puzzle)
}

func isOuterTurn(m cube.Move) bool {
	switch m.Letter {
	case 'R', 'L', 'U', 'D', 'F', 'B':
		return true
	}
	return false
}

// Scramble returns the Turns that start the Snapshot's Session.
func (s Snapshot) Scramble() []cube.Move { return s.scramble }

// Moves returns the Move history: every Move made after the Scramble.
func (s Snapshot) Moves() []cube.Move { return s.moves }

// Puzzle returns the Puzzle the Snapshot is for.
func (s Snapshot) Puzzle() cube.Puzzle { return s.puzzle }

// bodyVersion is the version of the body format. A body never changes once
// stored, so a new format gets a new version and old bodies stay readable.
// Version 2 added the "type" field (ADR 0005); a version-1 body has no type
// and reads as the Cube, so every share link stored before 2x2 support keeps
// its content-addressed ID.
const bodyVersion = 2

// body is the stored format: JSON with the fields in this order, Moves in
// notation separated by single spaces, and the Puzzle as its wire tag.
type body struct {
	Version  int    `json:"version"`
	Type     string `json:"type"`
	Scramble string `json:"scramble"`
	Moves    string `json:"moves"`
}

// Puzzle returns the Puzzle a stored body is for: its "type" tag, or the Cube
// when the tag is absent, as a version-1 body is.
func (b body) Puzzle() cube.Puzzle {
	p, _ := cube.ParsePuzzle(b.Type)
	return p
}

// Body returns the Snapshot's canonical serialization: the same Snapshot
// always gives the same bytes, however its notation was spaced.
func (s Snapshot) Body() []byte {
	b, err := json.Marshal(body{
		Version:  bodyVersion,
		Type:     s.puzzle.String(),
		Scramble: cube.FormatMoves(s.scramble),
		Moves:    cube.FormatMoves(s.moves),
	})
	if err != nil {
		panic(err) // a struct of strings always marshals
	}
	return b
}

// FromBody reads a Snapshot back from its [Snapshot.Body], including the bodies
// of earlier versions: a version-1 body has no "type" and reads as the Cube.
func FromBody(b []byte) (Snapshot, error) {
	var stored body
	if err := json.Unmarshal(b, &stored); err != nil {
		return Snapshot{}, fmt.Errorf("reading a Snapshot body: %w", err)
	}
	if stored.Version < 1 || stored.Version > bodyVersion {
		return Snapshot{}, fmt.Errorf("reading a Snapshot body: unknown version %d", stored.Version)
	}
	return ParseFor(stored.Scramble, stored.Moves, stored.Puzzle())
}

// IDs returns the IDs a body may be stored under, shortest first: every
// prefix of the URL-safe base64 SHA-256 of the body, from [IDLength]
// characters to the whole hash. A Store saves a body under the first one that
// is free or already holds the same body.
func IDs(body []byte) iter.Seq[string] {
	sum := sha256.Sum256(body)
	hash := base64.RawURLEncoding.EncodeToString(sum[:])
	return func(yield func(string) bool) {
		for n := IDLength; n <= len(hash); n++ {
			if !yield(hash[:n]) {
				return
			}
		}
	}
}

// Saved is a Snapshot as a Store holds it.
type Saved struct {
	ID        string
	Snapshot  Snapshot
	CreatedAt time.Time
}

// Store keeps Snapshots forever: they are never changed or deleted, so share
// links never break. Every implementation must pass the suite in
// internal/snapshot/storetest.
type Store interface {
	// Save stores a Snapshot and returns its ID. Saving a Snapshot that is
	// already stored stores nothing and returns the same ID.
	Save(ctx context.Context, s Snapshot) (id string, err error)
	// Load returns the Snapshot stored under id, or an error wrapping
	// ErrNotFound if there is none.
	Load(ctx context.Context, id string) (Saved, error)
}
