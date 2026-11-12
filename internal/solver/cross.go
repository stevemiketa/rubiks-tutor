package solver

import (
	"fmt"
	"math/bits"
	"strings"
	"sync"

	"github.com/stevemiketa/rubiks-tutor/internal/cube"
)

// Stage 1, the white cross. With white on top, it places the four white
// edges one at a time, the easiest first. Each edge goes in by the shortest
// sequence of outer-Layer Turns that leaves the edges already placed where
// they were; they may move out of the way and back in meanwhile. Every Move
// gets a note saying what it does for the edge going in.
var whiteCross = stageSpec{
	id:   "white-cross",
	name: "White cross",
	goal: "Make a white cross on top, with each edge matching the center beside it.",
	pieces: func() []string {
		var edges []string
		for _, name := range cube.PieceNames() {
			if strings.HasPrefix(name, "white-") && strings.HasSuffix(name, " edge") {
				edges = append(edges, name)
			}
		}
		return edges
	}(),
	finished: func(c cube.Cube) bool {
		return whiteCrossPlaced(crossEdges(c.Apply(whiteUpRotations(c)...))) == allCrossSlots
	},
	solve: solveWhiteCross,
}

// The cross edges are tracked by the top-layer Slot each belongs in, indexed
// 0 to 3 in this order. A cross is a set of these as a bitmask.
var crossSlotNames = [4]string{"UF", "UR", "UB", "UL"}

const allCrossSlots = 1<<len(crossSlotNames) - 1

// An edge position is where an edge's white Sticker is: one of the 24
// Stickers on edge Slots, which gives both the Slot and which way the edge
// faces.
type edgePos int8

// crossState is the position of the white edge that belongs in each cross
// Slot.
type crossState [4]edgePos

// edgeTables holds what the cross search needs, worked out once from the
// cube model.
type edgeTables struct {
	stickers [24]cube.Sticker // the Sticker at each edge position
	// home is the edge position of each cross Slot's top Sticker: where the
	// white Sticker of the edge that belongs there must end up.
	home [4]edgePos
	// partner is the edge position of the other Sticker in the same Slot.
	partner [24]edgePos
	// after[t][p] is where the Sticker at edge position p goes after
	// crossTurns[t].
	after [][24]edgePos
	// dist[set] holds, for each crossState of the edges in set, the fewest
	// Turns that bring every one of them home. See distance.
	dist [allCrossSlots + 1][]int8
}

// crossTurns are the Turns the cross is made with: every outer Layer, in the
// order ties between equally short sequences are broken.
var crossTurns = cube.MustParseMoves("F F' F2 R R' R2 U U' U2 L L' L2 B B' B2 D D' D2")

var tables = sync.OnceValue(func() *edgeTables {
	t := &edgeTables{}
	var index [54]edgePos
	for i := range index {
		index[i] = -1
	}
	n := 0
	for _, slot := range cube.Slots() {
		if len(slot.Stickers) != 2 {
			continue
		}
		a, b := edgePos(n), edgePos(n+1)
		t.stickers[a], t.stickers[b] = slot.Stickers[0], slot.Stickers[1]
		index[slot.Stickers[0]], index[slot.Stickers[1]] = a, b
		t.partner[a], t.partner[b] = b, a
		for i, name := range crossSlotNames {
			if slot.Name == name {
				t.home[i] = a // a Slot's first Sticker is on U
			}
		}
		n += 2
	}

	t.after = make([][24]edgePos, len(crossTurns))
	for ti, m := range crossTurns {
		for p, s := range t.stickers {
			t.after[ti][p] = index[stickerAfter(s, m)]
		}
	}

	for set := 1; set <= allCrossSlots; set++ {
		t.dist[set] = t.searchFromHome(set)
	}
	return t
})

// stickerAfter returns where the Sticker at s goes when m is applied, found
// by marking it with the only yellow Sticker on an otherwise white Cube.
func stickerAfter(s cube.Sticker, m cube.Move) cube.Sticker {
	var marked cube.Cube // the zero Cube is all white
	marked[s] = cube.Yellow
	moved := marked.Apply(m)
	for i, color := range moved {
		if color == cube.Yellow {
			return cube.Sticker(i)
		}
	}
	panic("solver: a Move lost a Sticker")
}

// key packs the positions of the edges in set into an index of dist[set]:
// base 24, the lowest cross Slot first.
func key(set int, s crossState) int {
	k, scale := 0, 1
	for i := range s {
		if set&(1<<i) != 0 {
			k += int(s[i]) * scale
			scale *= 24
		}
	}
	return k
}

// searchFromHome is a breadth-first search over the positions of the edges
// in set, outward from all of them home. Every Turn's inverse is a Turn too,
// so the distance out from home is the distance back.
func (t *edgeTables) searchFromHome(set int) []int8 {
	size := 1
	for range bits.OnesCount(uint(set)) {
		size *= 24
	}
	dist := make([]int8, size)
	for i := range dist {
		dist[i] = -1
	}
	home := crossState(t.home)
	dist[key(set, home)] = 0
	frontier := []crossState{home}
	for d := int8(1); len(frontier) > 0; d++ {
		var next []crossState
		for _, s := range frontier {
			for ti := range crossTurns {
				moved := t.turn(s, ti)
				if k := key(set, moved); dist[k] < 0 {
					dist[k] = d
					next = append(next, moved)
				}
			}
		}
		frontier = next
	}
	return dist
}

// turn returns the crossState after crossTurns[ti].
func (t *edgeTables) turn(s crossState, ti int) crossState {
	for i, p := range s {
		s[i] = t.after[ti][p]
	}
	return s
}

// distance is the fewest Turns that bring every edge in set home from s,
// wherever the other edges end up.
func (t *edgeTables) distance(set int, s crossState) int {
	return int(t.dist[set][key(set, s)])
}

// crossEdges finds the white edges on a Cube with white on top: for each
// cross Slot, the position of the white edge whose other color matches the
// center beside that Slot.
func crossEdges(c cube.Cube) crossState {
	t := tables()
	var whiteAt [6]edgePos // by the edge's other color
	for p, s := range t.stickers {
		if c[s] == cube.White {
			whiteAt[c[t.stickers[t.partner[p]]]] = edgePos(p)
		}
	}
	var s crossState
	for i := range s {
		s[i] = whiteAt[sideColor(c, i)]
	}
	return s
}

// sideColor is the color of the center beside cross Slot i.
func sideColor(c cube.Cube, i int) cube.Color {
	t := tables()
	side := t.stickers[t.partner[t.home[i]]]
	return c[cube.StickerAt(side.Face(), 1, 1)]
}

// whiteCrossPlaced returns the cross Slots whose edge is home.
func whiteCrossPlaced(s crossState) int {
	t := tables()
	set := 0
	for i, p := range s {
		if p == t.home[i] {
			set |= 1 << i
		}
	}
	return set
}

func solveWhiteCross(b *builder) {
	putWhiteOnTop(b)
	t := tables()
	s := crossEdges(b.cube)
	placed := whiteCrossPlaced(s)
	for placed != allCrossSlots {
		// The edge that takes the fewest Turns goes in next.
		next, nextDist := -1, 0
		for i := range s {
			if placed&(1<<i) == 0 {
				if d := t.distance(placed|1<<i, s); next < 0 || d < nextDist {
					next, nextDist = i, d
				}
			}
		}
		set := placed | 1<<next
		for d := nextDist; d > 0; d-- {
			for ti := range crossTurns {
				moved := t.turn(s, ti)
				if t.distance(set, moved) != d-1 {
					continue
				}
				b.move(crossTurns[ti], crossNote(b.cube, next, placed, s, moved, d == 1))
				s = moved
				break
			}
		}
		placed = set
	}
}

// crossNote explains a Turn made while edge i goes into the cross, from
// where the edges were before it and after it. last says whether it is the
// Turn that finishes putting the edge in.
func crossNote(c cube.Cube, i, placed int, before, after crossState, last bool) string {
	t := tables()
	edge := "the " + crossEdgeName(c, i)
	center := sideColor(c, i).String()
	var displaced, restored int
	for j := range before {
		if placed&(1<<j) == 0 {
			continue
		}
		wasHome, isHome := before[j] == t.home[j], after[j] == t.home[j]
		if wasHome && !isHome {
			displaced |= 1 << j
		}
		if !wasHome && isHome {
			restored |= 1 << j
		}
	}
	moved := before[i] != after[i]

	switch {
	case last && restored != 0 && !moved:
		return fmt.Sprintf("bring back %s, which completes it with %s in place", crossEdgeList(c, restored, placed), edge)
	case last && restored != 0:
		return fmt.Sprintf("put %s in place next to the %s center, and bring back %s", edge, center, crossEdgeList(c, restored, placed))
	case last:
		return fmt.Sprintf("put %s in place, white on top, next to the %s center", edge, center)
	case moved && displaced != 0:
		return fmt.Sprintf("move %s toward its place; this moves %s out of the way for now", edge, crossEdgeList(c, displaced, placed))
	case moved && restored != 0:
		return fmt.Sprintf("move %s toward its place, and bring back %s", edge, crossEdgeList(c, restored, placed))
	case moved:
		return fmt.Sprintf("move %s toward its place next to the %s center", edge, center)
	case displaced != 0:
		list, back := crossEdgeList(c, displaced, placed), "it comes"
		if !strings.HasPrefix(list, "the cross") && bits.OnesCount(uint(displaced)) > 1 {
			back = "they come"
		}
		return fmt.Sprintf("move %s out of the way so %s can go in; %s back in a moment", list, edge, back)
	case restored != 0:
		return fmt.Sprintf("bring back %s", crossEdgeList(c, restored, placed))
	default:
		return fmt.Sprintf("set up the next Turn for %s", edge)
	}
}

// crossEdgeName names the white edge that belongs in cross Slot i.
func crossEdgeName(c cube.Cube, i int) string {
	return "white-" + sideColor(c, i).String() + " edge"
}

// crossEdgeList names the edges in set, or calls them the cross when they are
// all of the placed edges and there are several.
func crossEdgeList(c cube.Cube, set, placed int) string {
	if set == placed && bits.OnesCount(uint(set)) > 1 {
		return "the cross"
	}
	var colors []string
	for i := range crossSlotNames {
		if set&(1<<i) != 0 {
			colors = append(colors, "white-"+sideColor(c, i).String())
		}
	}
	if len(colors) == 1 {
		return "the " + colors[0] + " edge"
	}
	return "the " + strings.Join(colors[:len(colors)-1], ", ") + " and " + colors[len(colors)-1] + " edges"
}
