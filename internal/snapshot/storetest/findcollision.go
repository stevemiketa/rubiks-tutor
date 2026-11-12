//go:build ignore

// Command findcollision finds two Snapshots whose IDs share their first
// snapshot.IDLength characters, so the store suite can check that the second
// one saved gets a longer ID. It prints them as Scramble notation.
//
// The search is a parallel Pollard rho with distinguished points: it walks
// the map from 60 bits, read as a 15-Turn Scramble, to the first 60 bits of
// that Snapshot's hash, until two walks meet. That takes about 2^30 hashes on
// average, well under a minute on a laptop. Run it from the repository root:
//
//	go run ./internal/snapshot/storetest/findcollision.go
//
// The result depends on the body format, so it only needs rerunning if that
// format gets a new version.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/rand/v2"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/snapshot"
)

// The 16 Turns a Scramble is built from, 4 bits each.
var alphabet = [16]string{"R", "R'", "R2", "L", "L'", "L2", "U", "U'", "U2", "D", "D'", "D2", "F", "F'", "F2", "B"}

const (
	idBits    = 6 * snapshot.IDLength // each base64 character holds 6 bits
	turns     = idBits / 4
	dpBits    = 18 // a walk ends at a value whose low dpBits bits are 0
	maxWalk   = 40 << dpBits
	valueMask = 1<<idBits - 1
)

// scramble is the Scramble that x stands for.
func scramble(x uint64) string {
	parts := make([]string, turns)
	for i := range turns {
		parts[i] = alphabet[x>>(4*(turns-1-i))&15]
	}
	return strings.Join(parts, " ")
}

// body is the Snapshot body of a Scramble with no Moves after it.
func body(x uint64) []byte {
	s, err := snapshot.Parse(scramble(x), "")
	if err != nil {
		panic(err)
	}
	return s.Body()
}

// walker computes the map quickly, reusing one buffer. Its output must match
// body, which main checks before searching.
type walker struct{ buf []byte }

var prefix, suffix = func() ([]byte, []byte) {
	b := body(0)
	i := bytes.Index(b, []byte(scramble(0)))
	return b[:i], b[i+len(scramble(0)):]
}()

func (w *walker) bytes(x uint64) []byte {
	w.buf = append(w.buf[:0], prefix...)
	for i := range turns {
		if i > 0 {
			w.buf = append(w.buf, ' ')
		}
		w.buf = append(w.buf, alphabet[x>>(4*(turns-1-i))&15]...)
	}
	return append(w.buf, suffix...)
}

func (w *walker) next(x uint64) uint64 {
	sum := sha256.Sum256(w.bytes(x))
	return binary.BigEndian.Uint64(sum[:8]) >> (64 - idBits)
}

type trail struct{ start, end, length uint64 }

func main() {
	var w walker
	for _, x := range []uint64{0, 1, 0xfedcba987654321} {
		if !bytes.Equal(w.bytes(x), body(x)) {
			fmt.Fprintf(os.Stderr, "the fast body %q differs from %q\n", w.bytes(x), body(x))
			os.Exit(1)
		}
	}

	start := time.Now()
	trails := make(chan trail, 64)
	for range runtime.NumCPU() {
		go func() {
			var w walker
			for {
				t := trail{start: rand.Uint64() & valueMask}
				x := t.start
				for ; x&(1<<dpBits-1) != 0 && t.length < maxWalk; t.length++ {
					x = w.next(x)
				}
				if t.length < maxWalk {
					t.end = x
					trails <- t
				}
			}
		}()
	}

	seen := map[uint64]trail{}
	for t := range trails {
		other, ok := seen[t.end]
		if !ok {
			seen[t.end] = t
			if len(seen)%500 == 0 {
				fmt.Fprintf(os.Stderr, "%d walks, %v\n", len(seen), time.Since(start).Round(time.Second))
			}
			continue
		}
		a, b, ok := meet(&w, t, other)
		if !ok {
			continue
		}
		fmt.Fprintf(os.Stderr, "found after %v\n", time.Since(start).Round(time.Second))
		for _, x := range []uint64{a, b} {
			ids := snapshot.IDs(body(x))
			var full string
			for id := range ids {
				full = id
			}
			fmt.Printf("%q  hash %s\n", scramble(x), full)
		}
		return
	}
}

// meet walks two trails that end at the same value until they merge, and
// returns the two different values that map to the same one.
func meet(w *walker, s, t trail) (uint64, uint64, bool) {
	a, b := s.start, t.start
	for la, lb := s.length, t.length; la != lb; {
		if la > lb {
			a, la = w.next(a), la-1
		} else {
			b, lb = w.next(b), lb-1
		}
	}
	if a == b {
		return 0, 0, false // one walk started on the other
	}
	for {
		na, nb := w.next(a), w.next(b)
		if na == nb {
			return a, b, true
		}
		a, b = na, nb
	}
}
