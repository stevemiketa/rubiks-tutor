# Cubular

Cubular is a 3D tutor that teaches people to solve a 3×3×3 cube by walking them through a human solving Method, Stage by Stage.

## The puzzle

**Cube**:
The 3×3×3 twisty puzzle, using the standard color scheme: white opposite yellow, green opposite blue, red opposite orange.
_Avoid_: Rubik's Cube (a trademark), puzzle

**Puzzle**:
Any twisty puzzle Cubular can teach. The Cube is the original; the Pocket Cube and the Mirror Cube are the first additions. A Session, a Snapshot, and a Solve each carry a puzzle type.
_Avoid_: variant, mode

**Pocket Cube**:
The 2×2×2 Cube — corners only, with no edges or centers. Cubular models it as a corners-only 3×3, so eight corner Pieces do the work and the rest are phantom.
_Avoid_: mini cube, baby cube

**Mirror Cube**:
A Cube whose Pieces are different sizes and a single color, solved by shape instead of color. Mechanically identical to the Cube; Cubular keeps the standard colors under the hood and changes only the look.
_Avoid_: bump cube, mirror blocks

**Phantom Piece**:
On the Pocket Cube, an edge or center Piece that exists in the 3×3 model but is frozen at solved and never shown.
_Avoid_: ghost piece, hidden piece

**Piece**:
One of the 26 small cubes that make up the Cube.
_Avoid_: cubie, cubelet, block

**Sticker**:
One colored square on the outside of a Piece.
_Avoid_: facelet, tile, square

**Live Sticker**:
A Sticker a Puzzle actually uses and shows, so the only kind a user can select. The Cube's are all of them; the Pocket Cube's are only its corner Stickers.
_Avoid_: real sticker, active sticker

**Phantom Sticker**:
A Sticker on a Phantom Piece: on the Pocket Cube, an edge or center Sticker that is frozen at solved and never shown. The complement of a Live Sticker.
_Avoid_: dead sticker, hidden sticker

**Layer**:
A 3×3 slab of nine Pieces that can turn together, either horizontal or vertical, including the middle slabs.
_Avoid_: row, column, slice, face (for the slab)

**Turn**:
Rotating one Layer a quarter or half turn relative to the rest of the Cube.
_Avoid_: twist, layer rotation

**Cube rotation**:
Rotating the whole Cube, which changes which side faces the user but not how the Pieces are arranged.
_Avoid_: flip, reorienting, rotating the cube in space

**Move**:
A single Turn or Cube rotation.
_Avoid_: step, action

## Sessions and sharing

**Scramble**:
The random sequence of Turns applied to a solved Cube to start a Session.
_Avoid_: shuffle, randomize

**Session**:
A user's live, changing work in the tutor: a Scramble and every Move made since.
_Avoid_: game, workspace

**Snapshot**:
A frozen copy of a Session that a share link points to; opening one starts a new Session from it and never changes it.
_Avoid_: snippet, share, save

## Solving

**Method**:
A human solving procedure made of an ordered list of Stages; Cubular teaches the beginner's layer-by-layer Method.
_Avoid_: strategy, approach

**Stage**:
A named part of a Method with a single goal, such as the white cross.
_Avoid_: step, phase

**Algorithm**:
A named, memorized sequence of Moves used within a Stage, such as Sune. Always the cubing sense, never the programming one.
_Avoid_: formula, sequence

**Solution**:
The Moves that take the Cube from its current state to solved, grouped into Stages.
_Avoid_: answer, solve

**Playback**:
Animating a Solution forward or backward, one Move at a time.
_Avoid_: replay, animation

**Stale solution**:
A Solution computed for a Cube that has since changed through a manual Turn.
_Avoid_: outdated solution, invalid solution
