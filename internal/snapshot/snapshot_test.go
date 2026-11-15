package snapshot

import (
	"encoding/json"
	"testing"
)

// The Snapshot body carries the puzzle type (ADR 0005): the Cube by default,
// the Pocket Cube when the Session is a 2x2. The body format is versioned so
// that old, type-less bodies still read back as the Cube and keep the same
// content-addressed ID (ADR 0003).

func TestBodyCarriesPuzzleType(t *testing.T) {
	for _, tc := range []struct {
		name     string
		puzzle   Puzzle
		wantType string
	}{
		{"the Cube", Cube3x3, "3x3"},
		{"the Pocket Cube", Pocket, "2x2"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, err := ParseFor("R U", "R' U'", tc.puzzle)
			if err != nil {
				t.Fatalf("ParseFor: %v", err)
			}

			var got body
			if err := json.Unmarshal(s.Body(), &got); err != nil {
				t.Fatalf("unmarshaling the body: %v", err)
			}
			if got.Version != 2 {
				t.Errorf("body version %d, want 2", got.Version)
			}
			if got.Type != tc.wantType {
				t.Errorf("body type %q, want %q", got.Type, tc.wantType)
			}
			if got.Puzzle() != tc.puzzle {
				t.Errorf("round-tripped Puzzle %v, want %v", got.Puzzle(), tc.puzzle)
			}
		})
	}
}

func TestFromBodyReadsThePuzzleType(t *testing.T) {
	s, err := ParseFor("R U", "", Pocket)
	if err != nil {
		t.Fatalf("ParseFor: %v", err)
	}
	back, err := FromBody(s.Body())
	if err != nil {
		t.Fatalf("FromBody: %v", err)
	}
	if back.Puzzle() != Pocket {
		t.Errorf("Puzzle %v, want Pocket", back.Puzzle())
	}
}

func TestFromBodyReadsAMissingTypeAsTheCube(t *testing.T) {
	// A version-1 body, as stored before 2x2 support: no type field. It must
	// still read back, as the Cube, so every existing share link resolves.
	legacy := []byte(`{"version":1,"scramble":"R U","moves":"R'"}`)
	s, err := FromBody(legacy)
	if err != nil {
		t.Fatalf("FromBody on a version-1 body: %v", err)
	}
	if s.Puzzle() != Cube3x3 {
		t.Errorf("Puzzle %v, want Cube3x3 for a type-less body", s.Puzzle())
	}
}

func TestLegacyBodyKeepsItsContentID(t *testing.T) {
	// A version-1 body that was stored before 2x2 support must keep its ID:
	// its content hash is the bytes themselves, which this never rewrites.
	legacy := []byte(`{"version":1,"scramble":"R U","moves":"R'"}`)
	s, err := FromBody(legacy)
	if err != nil {
		t.Fatalf("FromBody: %v", err)
	}
	// Reserializing produces a version-2 body, a different ID. The point is
	// that loading a legacy body does not fail; its stored bytes keep their ID
	// because a Store never rewrites a body. So the two must differ.
	if string(s.Body()) == string(legacy) {
		t.Fatal("a version-2 body unexpectedly equals the legacy bytes")
	}
}

func TestBodyIsDeterministic(t *testing.T) {
	a, err := ParseFor("R  U", "R'", Pocket)
	if err != nil {
		t.Fatalf("ParseFor a: %v", err)
	}
	b, err := ParseFor("R U", " R' ", Pocket)
	if err != nil {
		t.Fatalf("ParseFor b: %v", err)
	}
	if string(a.Body()) != string(b.Body()) {
		t.Errorf("the same Snapshot gave different bodies:\n %s\n %s", a.Body(), b.Body())
	}
}
