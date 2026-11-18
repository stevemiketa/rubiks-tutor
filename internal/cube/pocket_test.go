package cube_test

// Property-style tests for the 2x2 Pocket Cube corner-only Move engine
// (ADR 0005): over many random sequences of face Turns, ApplyPocket must leave
// every Phantom Sticker (edge or center) frozen at its solved color.

import (
	"math/rand"
	"testing"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// faceTurns is every Move a 2x2 has: the six face Turns with their primes and
// doubles.
var faceTurns = cube.MustParseMoves(everyFaceTurn)

// randomPocketMoves returns n random face Turns.
func randomPocketMoves(r *rand.Rand, n int) []cube.Move {
	moves := make([]cube.Move, n)
	for i := range moves {
		moves[i] = faceTurns[r.Intn(len(faceTurns))]
	}
	return moves
}

func TestApplyPocketFreezesPhantoms(t *testing.T) {
	r := rand.New(rand.NewSource(43))
	for trial := 0; trial < 2000; trial++ {
		moves := randomPocketMoves(r, r.Intn(40))
		got := cube.Solved().ApplyPocket(moves...)
		if !phantomsSolved(got) {
			t.Fatalf("Phantom Stickers moved after %s:\n got %s", cube.FormatMoves(moves), got)
		}
	}
}

func TestApplyPocketMatchesFullCubeOnCorners(t *testing.T) {
	// A 2x2's corners move exactly as the 3x3's do: applying the same Moves the
	// full way and the corner-only way must agree on every corner Sticker. Only
	// the Phantom Stickers may differ.
	r := rand.New(rand.NewSource(430))
	for trial := 0; trial < 2000; trial++ {
		moves := randomPocketMoves(r, r.Intn(40))
		full := cube.Solved().Apply(moves...)
		pocket := cube.Solved().ApplyPocket(moves...)
		for s := range cube.Sticker(54) {
			if cornerPositions[int(s)%9] && full[s] != pocket[s] {
				t.Fatalf("corner Sticker %s differs after %s: full %s, pocket %s",
					s, cube.FormatMoves(moves), full[s], pocket[s])
			}
		}
	}
}
