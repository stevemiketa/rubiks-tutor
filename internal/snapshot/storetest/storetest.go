// Package storetest is the test suite every [snapshot.Store] implementation
// must pass (ADR 0004). Each implementation's tests call [Run] with a way to
// open a store.
package storetest

import (
	"errors"
	"math/rand/v2"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// The Scrambles of two Snapshots, with no Moves after them, whose IDs share
// their first snapshot.IDLength characters, found by findcollision.go in this
// directory. Their hashes, worked out with openssl, start
// CFIoSNdf-CyS2xPdX... and CFIoSNdf-CIcocThV...
const (
	collidingA = "F' R2 F D' U2 F L2 D2 F2 D' D F' U2 D2 D2"
	collidingB = "R' D F2 F F2 R2 F D2 F' D2 F U' L2 R2 D"
)

// Run runs the suite. newStore opens a store for one test; the suite doesn't
// assume it starts empty, so it can run against a database that persists
// between runs.
func Run(t *testing.T, newStore func(t *testing.T) snapshot.Store) {
	t.Run("a saved Snapshot loads back by its ID", func(t *testing.T) {
		store := newStore(t)
		s := unique(t, "M E S x y' z2 R U2 L'")

		before := time.Now()
		id := save(t, store, s)
		after := time.Now()

		got := load(t, store, id)
		if got.ID != id {
			t.Errorf("loaded ID %q, want %q", got.ID, id)
		}
		assertSame(t, got.Snapshot, s)
		if got.CreatedAt.Location() != time.UTC {
			t.Errorf("CreatedAt %v is not in UTC", got.CreatedAt)
		}
		if got.CreatedAt.Before(before.Truncate(time.Microsecond)) || got.CreatedAt.After(after) {
			t.Errorf("CreatedAt %v, want between %v and %v", got.CreatedAt, before, after)
		}
	})

	t.Run("the ID is the shortest candidate from the Snapshot's hash", func(t *testing.T) {
		s := unique(t, "")
		id := save(t, newStore(t), s)

		if want := first(snapshot.IDs(s.Body())); id != want {
			t.Errorf("ID %q, want %q", id, want)
		}
		if len(id) != snapshot.IDLength {
			t.Errorf("ID %q has %d characters, want %d", id, len(id), snapshot.IDLength)
		}
	})

	t.Run("saving the same Snapshot again stores nothing and returns the same ID", func(t *testing.T) {
		store := newStore(t)
		s := unique(t, "R U R' U'")
		id := save(t, store, s)
		first := load(t, store, id)

		// The same Snapshot, written with different spacing.
		again, err := snapshot.Parse(" "+cube.FormatMoves(s.Scramble())+" ", strings.ReplaceAll(cube.FormatMoves(s.Moves()), " ", "\t "))
		if err != nil {
			t.Fatal(err)
		}
		if got := save(t, store, again); got != id {
			t.Errorf("second save returned ID %q, want %q", got, id)
		}
		if got := load(t, store, id); !got.CreatedAt.Equal(first.CreatedAt) {
			t.Errorf("CreatedAt changed from %v to %v", first.CreatedAt, got.CreatedAt)
		}
	})

	t.Run("different Snapshots get different IDs", func(t *testing.T) {
		store := newStore(t)
		a, b := unique(t, "R"), unique(t, "R")

		idA, idB := save(t, store, a), save(t, store, b)

		if idA == idB {
			t.Fatalf("both Snapshots got ID %q", idA)
		}
		assertSame(t, load(t, store, idA).Snapshot, a)
		assertSame(t, load(t, store, idB).Snapshot, b)
	})

	t.Run("an ID taken by a different Snapshot is lengthened until it is unique", func(t *testing.T) {
		store := newStore(t)
		a, b := mustParse(t, collidingA, ""), mustParse(t, collidingB, "")
		if first(snapshot.IDs(a.Body())) != first(snapshot.IDs(b.Body())) {
			t.Fatal("collidingA and collidingB no longer share an ID; rerun findcollision.go")
		}

		idA := save(t, store, a)
		idB := save(t, store, b)

		if idA != "CFIoSNdf-C" {
			t.Errorf("first ID %q, want CFIoSNdf-C", idA)
		}
		if idB != "CFIoSNdf-CI" {
			t.Errorf("second ID %q, want CFIoSNdf-CI: the first ID lengthened by one character", idB)
		}
		assertSame(t, load(t, store, idA).Snapshot, a)
		assertSame(t, load(t, store, idB).Snapshot, b)
		// Saving either again finds it where it was stored.
		if got := save(t, store, b); got != idB {
			t.Errorf("saving the second again returned %q, want %q", got, idB)
		}
		if got := save(t, store, a); got != idA {
			t.Errorf("saving the first again returned %q, want %q", got, idA)
		}
	})

	t.Run("an unknown ID is not found", func(t *testing.T) {
		store := newStore(t)
		id := save(t, store, unique(t, ""))

		for _, unknown := range []string{"", "nope", id[:len(id)-1], id + "A", strings.ToUpper(id), "Ab3_x-9QzK", strings.Repeat("A", 100)} {
			if unknown == id {
				continue
			}
			if _, err := store.Load(t.Context(), unknown); !errors.Is(err, snapshot.ErrNotFound) {
				t.Errorf("Load(%q): error %v, want ErrNotFound", unknown, err)
			}
		}
	})

	t.Run("the largest Snapshot round-trips", func(t *testing.T) {
		store := newStore(t)
		moves := make([]cube.Move, snapshot.MaxMoves-25)
		rng := rand.New(rand.NewPCG(rand.Uint64(), 0))
		all := cube.MustParseMoves("R L U D F B M E S x y z R' L' U' D' F' B' M' E' S' x' y' z' R2 L2 U2 D2 F2 B2 M2 E2 S2 x2 y2 z2")
		for i := range moves {
			moves[i] = all[rng.IntN(len(all))]
		}
		s, err := snapshot.New(cube.MustParseMoves(strings.Repeat("R U ", 12)+"F"), moves)
		if err != nil {
			t.Fatal(err)
		}

		assertSame(t, load(t, store, save(t, store, s)).Snapshot, s)
	})

	t.Run("concurrent saves succeed and agree on IDs", func(t *testing.T) {
		store := newStore(t)
		same := unique(t, "")
		const n = 8
		var wg sync.WaitGroup
		ids := make([]string, n)
		errs := make([]error, 2*n)
		for i := range n {
			wg.Go(func() { ids[i], errs[i] = store.Save(t.Context(), same) })
			wg.Go(func() { _, errs[n+i] = store.Save(t.Context(), unique(t, "")) })
		}
		wg.Wait()

		for _, err := range errs {
			if err != nil {
				t.Fatalf("Save: %v", err)
			}
		}
		for _, id := range ids {
			if id != ids[0] {
				t.Fatalf("concurrent saves of one Snapshot returned IDs %q", ids)
			}
		}
	})
}

// unique returns a Snapshot no earlier run has saved: a random Scramble,
// then moves.
func unique(t *testing.T, moves string) snapshot.Snapshot {
	t.Helper()
	turns := strings.Fields("R L U D F B R' L' U' D' F' B' R2 L2 U2 D2 F2 B2")
	scramble := make([]string, 25)
	for i := range scramble {
		scramble[i] = turns[rand.IntN(len(turns))]
	}
	return mustParse(t, strings.Join(scramble, " "), moves)
}

func mustParse(t *testing.T, scramble, moves string) snapshot.Snapshot {
	t.Helper()
	s, err := snapshot.Parse(scramble, moves)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func save(t *testing.T, store snapshot.Store, s snapshot.Snapshot) string {
	t.Helper()
	id, err := store.Save(t.Context(), s)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	return id
}

func load(t *testing.T, store snapshot.Store, id string) snapshot.Saved {
	t.Helper()
	saved, err := store.Load(t.Context(), id)
	if err != nil {
		t.Fatalf("Load(%q): %v", id, err)
	}
	return saved
}

func assertSame(t *testing.T, got, want snapshot.Snapshot) {
	t.Helper()
	if g, w := cube.FormatMoves(got.Scramble()), cube.FormatMoves(want.Scramble()); g != w {
		t.Errorf("Scramble %q, want %q", g, w)
	}
	if g, w := cube.FormatMoves(got.Moves()), cube.FormatMoves(want.Moves()); g != w {
		t.Errorf("Moves %q, want %q", g, w)
	}
}

func first(ids func(func(string) bool)) string {
	for id := range ids {
		return id
	}
	return ""
}
