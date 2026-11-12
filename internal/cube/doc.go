// Package cube models the Cube as its 54 Stickers as currently seen. The
// TypeScript model in web/src/cube has the same behavior, and both run the
// shared test cases in testdata/cube (ADR 0002): change them together.
//
// # State
//
// A [Cube] is the color of each [Sticker], indexed 0 to 53 as
// face*9 + row*3 + col, with faces in the order U R F D L B. Each face is read
// row by row as laid out in this net, the standard Kociemba facelet layout,
// where the side faces are seen from outside with U at the top edge, U is
// seen from above with B at its top edge, and D is seen from below with F at
// its top edge:
//
//	           +----------+
//	           | U0 U1 U2 |
//	           | U3 U4 U5 |
//	           | U6 U7 U8 |
//	+----------+----------+----------+----------+
//	| L0 L1 L2 | F0 F1 F2 | R0 R1 R2 | B0 B1 B2 |
//	| L3 L4 L5 | F3 F4 F5 | R3 R4 R5 | B3 B4 B5 |
//	| L6 L7 L8 | F6 F7 F8 | R6 R7 R8 | B6 B7 B8 |
//	+----------+----------+----------+----------+
//	           | D0 D1 D2 |
//	           | D3 D4 D5 |
//	           | D6 D7 D8 |
//	           +----------+
//
// Faces are positions, not colors: U is always the face currently on top. A
// Cube rotation moves every Sticker, so R always means the Layer currently on
// the right. A solved Cube in the standard orientation has white on U, red on
// R, green on F, yellow on D, orange on L and blue on B.
//
// [Cube.String] prints a state as six groups of nine color letters, one group
// per face in index order, such as
// "WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB" for solved.
//
// # Positions in space
//
// [Slot] positions use x toward R, y toward U and z toward F, each -1, 0 or
// 1, matching three.js with the camera in front of F.
//
// # Notation
//
// Outer Layers R L U D F B, middle Layers M E S, Cube rotations x y z, each
// with an optional suffix: ' for counterclockwise or 2 for a half Turn. M
// turns as L does, E as D and S as F; x turns as R does, y as U and z as F.
// Wide Turns are not supported.
//
// # Pieces
//
// A Piece is named by its Sticker colors in the order white, yellow, green,
// blue, red, orange, then its kind: "white center", "white-green edge",
// "white-green-red corner". A [Slot] is named by the faces it touches in the
// order U/D, F/B, R/L: "U", "UF", "UFR". In a solved Cube in the standard
// orientation, each Piece's colors line up with its Slot's faces.
package cube
