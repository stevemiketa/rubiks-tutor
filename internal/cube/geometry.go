package cube

import (
	"fmt"
	"strings"
)

// vec is a point or direction in Cube space: x toward R, y toward U, z
// toward F.
type vec [3]int

func (a vec) add(b vec) vec   { return vec{a[0] + b[0], a[1] + b[1], a[2] + b[2]} }
func (a vec) scale(k int) vec { return vec{a[0] * k, a[1] * k, a[2] * k} }
func (a vec) dot(b vec) int   { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
func (a vec) cross(b vec) vec {
	return vec{a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]}
}

// clockwise rotates v a quarter turn clockwise as seen looking at the origin
// from the tip of the unit axis a: v' = a(a·v) - a×v.
func clockwise(a, v vec) vec { return a.scale(a.dot(v)).add(a.cross(v).scale(-1)) }

// faceFrames gives, for each face, its outward normal and the directions of
// increasing column and row in the package doc's net.
var faceFrames = [6]struct{ normal, right, down vec }{
	U: {vec{0, 1, 0}, vec{1, 0, 0}, vec{0, 0, 1}},
	R: {vec{1, 0, 0}, vec{0, 0, -1}, vec{0, -1, 0}},
	F: {vec{0, 0, 1}, vec{1, 0, 0}, vec{0, -1, 0}},
	D: {vec{0, -1, 0}, vec{1, 0, 0}, vec{0, 0, -1}},
	L: {vec{-1, 0, 0}, vec{0, 0, 1}, vec{0, -1, 0}},
	B: {vec{0, 0, -1}, vec{-1, 0, 0}, vec{0, -1, 0}},
}

// stickerPlace is where a Sticker sits: the position of its Piece and the
// direction it faces.
type stickerPlace struct{ piece, normal vec }

func placeOf(s Sticker) stickerPlace {
	frame := faceFrames[s.Face()]
	piece := frame.normal.add(frame.right.scale(s.Col() - 1)).add(frame.down.scale(s.Row() - 1))
	return stickerPlace{piece, frame.normal}
}

var stickerAtPlace = func() map[stickerPlace]Sticker {
	m := map[stickerPlace]Sticker{}
	for s := range Sticker(54) {
		m[placeOf(s)] = s
	}
	return m
}()

// letterAxes gives the axis each Letter turns clockwise around, and which
// Layers along it move: the outer one (depth 1), the middle one (depth 0),
// or the whole Cube.
var letterAxes = map[Letter]struct {
	axis  vec
	depth int // 1 outer, 0 middle, -1 whole Cube
}{
	'R': {vec{1, 0, 0}, 1}, 'L': {vec{-1, 0, 0}, 1},
	'U': {vec{0, 1, 0}, 1}, 'D': {vec{0, -1, 0}, 1},
	'F': {vec{0, 0, 1}, 1}, 'B': {vec{0, 0, -1}, 1},
	'M': {vec{-1, 0, 0}, 0}, 'E': {vec{0, -1, 0}, 0}, 'S': {vec{0, 0, 1}, 0},
	'x': {vec{1, 0, 0}, -1}, 'y': {vec{0, 1, 0}, -1}, 'z': {vec{0, 0, 1}, -1},
}

// perm says where each Sticker goes: the Sticker at index i moves to perm[i].
type perm [54]Sticker

func permute[T any](state [54]T, p perm) [54]T {
	var next [54]T
	for i, to := range p {
		next[to] = state[i]
	}
	return next
}

var amounts = [3]Amount{Clockwise, Counterclockwise, Half}

func moveIndex(m Move) int {
	li := strings.IndexByte(letters, byte(m.Letter))
	for ai, a := range amounts {
		if li >= 0 && a == m.Amount {
			return li*3 + ai
		}
	}
	panic(fmt.Sprintf("cube: invalid Move %+v", m))
}

// allMoves lists every Move, in moveIndex order.
var allMoves = func() []Move {
	var ms []Move
	for i := range len(letters) {
		for _, a := range amounts {
			ms = append(ms, Move{Letter(letters[i]), a})
		}
	}
	return ms
}()

var movePerms = func() []perm {
	perms := make([]perm, len(allMoves))
	for i, m := range allMoves {
		la := letterAxes[m.Letter]
		quarters := (int(m.Amount) + 4) % 4
		for s := range Sticker(54) {
			place := placeOf(s)
			if la.depth >= 0 && place.piece.dot(la.axis) != la.depth {
				perms[i][s] = s
				continue
			}
			for range quarters {
				place = stickerPlace{clockwise(la.axis, place.piece), clockwise(la.axis, place.normal)}
			}
			perms[i][s] = stickerAtPlace[place]
		}
	}
	return perms
}()

func movePerm(m Move) perm { return movePerms[moveIndex(m)] }
