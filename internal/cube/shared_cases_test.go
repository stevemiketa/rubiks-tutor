package cube_test

// The shared cube test cases (ADR 0002). The TypeScript suite in
// web/src/cube/sharedCases.test.ts loads the same files, so the two models
// can't drift apart. Every file in testdata/cube is loaded; a file of an
// unknown kind, or a field this suite doesn't know, fails the run rather than
// being skipped.

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

const casesDir = "../../testdata/cube"

// Every Move in the notation, which the case files must cover.
const (
	everyMove = "R R' R2 L L' L2 U U' U2 D D' D2 F F' F2 B B' B2 " +
		"M M' M2 E E' E2 S S' S2 x x' x2 y y' y2 z z' z2"
	everyRotation = "x x' x2 y y' y2 z z' z2"
)

// runners maps each case-file kind to the function that checks its cases.
var runners = map[string]func(t *testing.T, data []byte){
	"notation":     runNotationCases,
	"moves":        runMoveCases,
	"inverse":      runInverseCases,
	"equivalences": runEquivalenceCases,
	"relabel":      runRelabelCases,
	"pieces":       runPieceCases,
}

func TestSharedCases(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join(casesDir, "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) == 0 {
		t.Fatalf("no shared cases found in %s", casesDir)
	}
	seen := map[string]bool{}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var head struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(data, &head); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		run, ok := runners[head.Kind]
		if !ok {
			t.Errorf("%s: unknown kind %q", path, head.Kind)
			continue
		}
		seen[head.Kind] = true
		t.Run(filepath.Base(path), func(t *testing.T) { run(t, data) })
	}
	for kind := range runners {
		if !seen[kind] {
			t.Errorf("no case file of kind %q", kind)
		}
	}
}

// decodeFile decodes a case file into v. It fails on fields this suite
// doesn't know, and on missing fields: besides kind, description and cases,
// the file must have every field in top, and each case must have a name and
// every field in perCase. So a misspelled or dropped expectation can't be
// silently ignored.
func decodeFile(t *testing.T, data []byte, v any, top, perCase []string) {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		t.Fatalf("decoding cases: %v", err)
	}
	var file map[string]json.RawMessage
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatal(err)
	}
	for _, field := range append([]string{"kind", "description", "cases"}, top...) {
		if _, ok := file[field]; !ok {
			t.Errorf("missing top-level field %q", field)
		}
	}
	var cases []map[string]json.RawMessage
	if err := json.Unmarshal(file["cases"], &cases); err != nil {
		t.Fatal(err)
	}
	for i, c := range cases {
		for _, field := range append([]string{"name"}, perCase...) {
			if _, ok := c[field]; !ok {
				t.Errorf("case %d: missing field %q", i, field)
			}
		}
	}
}

// eachCase runs check once per named case, failing on missing or repeated
// names.
func eachCase[C any](t *testing.T, cases []C, name func(C) string, check func(t *testing.T, c C)) {
	t.Helper()
	if len(cases) == 0 {
		t.Fatal("file has no cases")
	}
	names := map[string]bool{}
	for _, c := range cases {
		n := name(c)
		if n == "" || names[n] {
			t.Fatalf("case name %q is empty or repeated", n)
		}
		names[n] = true
		t.Run(n, func(t *testing.T) { check(t, c) })
	}
}

func parseMoves(t *testing.T, notation string) []cube.Move {
	t.Helper()
	moves, err := cube.ParseMoves(notation)
	if err != nil {
		t.Fatalf("ParseMoves(%q): %v", notation, err)
	}
	return moves
}

type notationCase struct {
	Name    string  `json:"name"`
	Input   string  `json:"input"`
	Printed *string `json:"printed"`
	Error   *struct {
		Offset int    `json:"offset"`
		Token  string `json:"token"`
	} `json:"error"`
}

func runNotationCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string         `json:"kind"`
		Description string         `json:"description"`
		Cases       []notationCase `json:"cases"`
	}
	decodeFile(t, data, &file, nil, []string{"input"})
	eachCase(t, file.Cases, func(c notationCase) string { return c.Name }, func(t *testing.T, c notationCase) {
		moves, err := cube.ParseMoves(c.Input)
		if c.Error != nil {
			var perr *cube.ParseError
			if !errors.As(err, &perr) {
				t.Fatalf("ParseMoves(%q) = %v, %v; want a *cube.ParseError", c.Input, moves, err)
			}
			if perr.Offset != c.Error.Offset || perr.Token != c.Error.Token {
				t.Errorf("ParseMoves(%q) rejected %q at offset %d; want %q at offset %d",
					c.Input, perr.Token, perr.Offset, c.Error.Token, c.Error.Offset)
			}
			return
		}
		if err != nil {
			t.Fatalf("ParseMoves(%q): %v", c.Input, err)
		}
		want := c.Input
		if c.Printed != nil {
			want = *c.Printed
		}
		if got := cube.FormatMoves(moves); got != want {
			t.Errorf("FormatMoves(ParseMoves(%q)) = %q; want %q", c.Input, got, want)
		}
	})
}

// parseState parses a case's state, or returns a solved Cube for "".
func parseState(t *testing.T, state string) cube.Cube {
	t.Helper()
	if state == "" {
		return cube.Solved()
	}
	c, err := cube.ParseCube(state)
	if err != nil {
		t.Fatalf("ParseCube(%q): %v", state, err)
	}
	if got := c.String(); got != state {
		t.Fatalf("ParseCube(%q).String() = %q", state, got)
	}
	return c
}

type moveCase struct {
	Name   string `json:"name"`
	Start  string `json:"start"`
	Moves  string `json:"moves"`
	Expect string `json:"expect"`
	Solved bool   `json:"solved"`
}

func runMoveCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string     `json:"kind"`
		Description string     `json:"description"`
		Cases       []moveCase `json:"cases"`
	}
	decodeFile(t, data, &file, nil, []string{"moves", "expect", "solved"})
	fromSolved := map[string]bool{}
	for _, c := range file.Cases {
		if c.Start == "" {
			fromSolved[c.Moves] = true
		}
	}
	for _, m := range strings.Fields(everyMove) {
		if !fromSolved[m] {
			t.Errorf("no case applies %s alone to a solved Cube", m)
		}
	}
	eachCase(t, file.Cases, func(c moveCase) string { return c.Name }, func(t *testing.T, c moveCase) {
		got := parseState(t, c.Start).Apply(parseMoves(t, c.Moves)...)
		if want := parseState(t, c.Expect); got != want {
			t.Errorf("after %q:\n got  %s\n want %s", c.Moves, got, want)
		}
		if got.IsSolved() != c.Solved {
			t.Errorf("IsSolved() = %v after %q; want %v", got.IsSolved(), c.Moves, c.Solved)
		}
	})
}

type inverseCase struct {
	Name    string `json:"name"`
	Start   string `json:"start"`
	Moves   string `json:"moves"`
	Inverse string `json:"inverse"`
}

func runInverseCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string        `json:"kind"`
		Description string        `json:"description"`
		Cases       []inverseCase `json:"cases"`
	}
	decodeFile(t, data, &file, nil, []string{"moves", "inverse"})
	eachCase(t, file.Cases, func(c inverseCase) string { return c.Name }, func(t *testing.T, c inverseCase) {
		moves := parseMoves(t, c.Moves)
		inverse := cube.Invert(moves)
		if got := cube.FormatMoves(inverse); got != c.Inverse {
			t.Errorf("Invert(%q) = %q; want %q", c.Moves, got, c.Inverse)
		}
		start := parseState(t, c.Start)
		if got := start.Apply(moves...).Apply(inverse...); got != start {
			t.Errorf("%q then its inverse:\n got  %s\n want %s", c.Moves, got, start)
		}
	})
}

type equivalenceCase struct {
	Name  string `json:"name"`
	Start string `json:"start"`
	A     string `json:"a"`
	B     string `json:"b"`
}

func runEquivalenceCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string            `json:"kind"`
		Description string            `json:"description"`
		Cases       []equivalenceCase `json:"cases"`
	}
	decodeFile(t, data, &file, nil, []string{"a", "b"})
	eachCase(t, file.Cases, func(c equivalenceCase) string { return c.Name }, func(t *testing.T, c equivalenceCase) {
		start := parseState(t, c.Start)
		a, b := start.Apply(parseMoves(t, c.A)...), start.Apply(parseMoves(t, c.B)...)
		if a != b {
			t.Errorf("%q and %q differ:\n %s\n %s", c.A, c.B, a, b)
		}
	})
}

type relabelCase struct {
	Name      string `json:"name"`
	Start     string `json:"start"`
	Rotation  string `json:"rotation"`
	Moves     string `json:"moves"`
	Relabeled string `json:"relabeled"`
}

func runRelabelCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string        `json:"kind"`
		Description string        `json:"description"`
		Cases       []relabelCase `json:"cases"`
	}
	decodeFile(t, data, &file, nil, []string{"rotation", "moves", "relabeled"})
	rotations := map[string]bool{}
	for _, c := range file.Cases {
		if c.Moves != everyMove {
			t.Errorf("case %q relabels %q; want every Move: %q", c.Name, c.Moves, everyMove)
		}
		rotations[c.Rotation] = true
	}
	for _, r := range strings.Fields(everyRotation) {
		if !rotations[r] {
			t.Errorf("no case relabels through %s", r)
		}
	}
	eachCase(t, file.Cases, func(c relabelCase) string { return c.Name }, func(t *testing.T, c relabelCase) {
		rotation, err := cube.ParseMove(c.Rotation)
		if err != nil {
			t.Fatal(err)
		}
		moves, want := parseMoves(t, c.Moves), parseMoves(t, c.Relabeled)
		if len(moves) != len(want) {
			t.Fatalf("%d moves but %d relabeled", len(moves), len(want))
		}
		start := parseState(t, c.Start)
		for i, m := range moves {
			got := m.Relabel(rotation)
			if got != want[i] {
				t.Errorf("%v relabeled through %v = %v; want %v", m, rotation, got, want[i])
			}
			if before, after := start.Apply(m, rotation), start.Apply(rotation, got); before != after {
				t.Errorf("%v then %v differs from %v then %v", m, rotation, rotation, got)
			}
		}
	})
}

type pieceCase struct {
	Name   string            `json:"name"`
	Start  string            `json:"start"`
	Moves  string            `json:"moves"`
	At     map[string]string `json:"at"`
	Locate map[string]string `json:"locate"`
}

func formatStickers(stickers []cube.Sticker) string {
	parts := make([]string, len(stickers))
	for i, s := range stickers {
		parts[i] = s.String()
	}
	return strings.Join(parts, " ")
}

func runPieceCases(t *testing.T, data []byte) {
	var file struct {
		Kind        string `json:"kind"`
		Description string `json:"description"`
		Slots       []struct {
			Slot     string `json:"slot"`
			Stickers string `json:"stickers"`
			Position [3]int `json:"position"`
		} `json:"slots"`
		Names        []string    `json:"names"`
		InvalidNames []string    `json:"invalidNames"`
		Cases        []pieceCase `json:"cases"`
	}
	decodeFile(t, data, &file, []string{"slots", "names", "invalidNames"}, []string{"moves", "at", "locate"})

	t.Run("slots", func(t *testing.T) {
		slots := cube.Slots()
		if len(slots) != len(file.Slots) {
			t.Fatalf("Slots() has %d Slots; want %d", len(slots), len(file.Slots))
		}
		for i, want := range file.Slots {
			got := slots[i]
			if got.Name != want.Slot || formatStickers(got.Stickers) != want.Stickers || got.Position != want.Position {
				t.Errorf("Slots()[%d] = %s %q %v; want %s %q %v", i,
					got.Name, formatStickers(got.Stickers), got.Position, want.Slot, want.Stickers, want.Position)
			}
		}
	})
	t.Run("names", func(t *testing.T) {
		if got := cube.PieceNames(); !slices.Equal(got, file.Names) {
			t.Errorf("PieceNames() = %q\nwant %q", got, file.Names)
		}
	})
	t.Run("invalid names", func(t *testing.T) {
		for _, name := range file.InvalidNames {
			if loc, err := cube.Solved().Locate(name); err == nil {
				t.Errorf("Locate(%q) = %v; want an error", name, loc)
			}
		}
	})
	eachCase(t, file.Cases, func(c pieceCase) string { return c.Name }, func(t *testing.T, c pieceCase) {
		state := parseState(t, c.Start).Apply(parseMoves(t, c.Moves)...)
		for slot, want := range c.At {
			if got, err := state.PieceAt(slot); err != nil || got != want {
				t.Errorf("PieceAt(%q) = %q, %v; want %q", slot, got, err, want)
			}
		}
		for piece, want := range c.Locate {
			loc, err := state.Locate(piece)
			if err != nil {
				t.Errorf("Locate(%q): %v", piece, err)
				continue
			}
			if got := formatStickers(loc.Stickers); got != want {
				t.Errorf("Locate(%q) = %q; want %q", piece, got, want)
			}
			if wantSlot := slotOf(t, want); loc.Slot != wantSlot {
				t.Errorf("Locate(%q).Slot = %q; want %q", piece, loc.Slot, wantSlot)
			}
		}
	})
}

// slotOf names the Slot that holds the given Stickers, such as "UFR" for
// "R0 U8 F2".
func slotOf(t *testing.T, stickers string) string {
	t.Helper()
	for _, slot := range cube.Slots() {
		if len(slot.Stickers) != len(strings.Fields(stickers)) {
			continue
		}
		all := true
		for _, s := range slot.Stickers {
			all = all && slices.Contains(strings.Fields(stickers), s.String())
		}
		if all {
			return slot.Name
		}
	}
	t.Fatalf("no Slot has Stickers %q", stickers)
	return ""
}
