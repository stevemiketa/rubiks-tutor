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

// Snapshot is a Scramble and the Move history made after it. Use [New] or
// [Parse] to make one; the zero Snapshot is valid and empty.
type Snapshot struct {
	scramble []cube.Move
	moves    []cube.Move
}

// New returns the Snapshot of a Scramble and a Move history. The Scramble
// may contain only outer-Layer Turns, and the two together at most
// [MaxMoves] Moves.
func New(scramble, moves []cube.Move) (Snapshot, error) {
	for i, m := range scramble {
		if !isOuterTurn(m) {
			return Snapshot{}, fmt.Errorf("%w: Move %d of the Scramble is %v", ErrInvalidScramble, i+1, m)
		}
	}
	if n := len(scramble) + len(moves); n > MaxMoves {
		return Snapshot{}, fmt.Errorf("%w: %d Moves, more than the %d a Snapshot can hold", ErrTooManyMoves, n, MaxMoves)
	}
	return Snapshot{scramble: scramble, moves: moves}, nil
}

// NotationError reports which field of a Snapshot holds invalid notation.
// It wraps both [ErrInvalidNotation] and the [*cube.ParseError].
type NotationError struct {
	Field string // "scramble" or "moves"
	Err   *cube.ParseError
}

func (e *NotationError) Error() string {
	return fmt.Sprintf("%s: %v", e.Field, e.Err)
}

func (e *NotationError) Unwrap() []error { return []error{ErrInvalidNotation, e.Err} }

// Parse returns the Snapshot of a Scramble and a Move history written in
// standard notation, validated as [New] does.
func Parse(scramble, moves string) (Snapshot, error) {
	s, err := parseMoves("scramble", scramble)
	if err != nil {
		return Snapshot{}, err
	}
	m, err := parseMoves("moves", moves)
	if err != nil {
		return Snapshot{}, err
	}
	return New(s, m)
}

func parseMoves(field, notation string) ([]cube.Move, error) {
	moves, err := cube.ParseMoves(notation)
	if perr, ok := errors.AsType[*cube.ParseError](err); ok {
		return nil, &NotationError{Field: field, Err: perr}
	}
	return moves, err
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

// bodyVersion is the version of the body format. A body never changes once
// stored, so a new format gets a new version and old bodies stay readable.
const bodyVersion = 1

// body is the stored format: JSON with the fields in this order, and Moves in
// notation separated by single spaces.
type body struct {
	Version  int    `json:"version"`
	Scramble string `json:"scramble"`
	Moves    string `json:"moves"`
}

// Body returns the Snapshot's canonical serialization: the same Snapshot
// always gives the same bytes, however its notation was spaced.
func (s Snapshot) Body() []byte {
	b, err := json.Marshal(body{
		Version:  bodyVersion,
		Scramble: cube.FormatMoves(s.scramble),
		Moves:    cube.FormatMoves(s.moves),
	})
	if err != nil {
		panic(err) // a struct of strings always marshals
	}
	return b
}

// FromBody reads a Snapshot back from its [Snapshot.Body].
func FromBody(b []byte) (Snapshot, error) {
	var stored body
	if err := json.Unmarshal(b, &stored); err != nil {
		return Snapshot{}, fmt.Errorf("reading a Snapshot body: %w", err)
	}
	if stored.Version != bodyVersion {
		return Snapshot{}, fmt.Errorf("reading a Snapshot body: unknown version %d", stored.Version)
	}
	return Parse(stored.Scramble, stored.Moves)
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
