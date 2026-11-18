# New Puzzles start as modes of the 3×3 engine, not behind a Puzzle interface

Cubular is adding more Puzzles: the Pocket Cube (2×2) and the Mirror Cube now, and the N×N and non-cubic family (4×4, 5×5, Pyraminx, Megaminx) later in #41. For the near-term pair we keep the concrete 3×3 Cube model and the Go Solver and add each Puzzle as a mode or a presentation over the existing engine, rather than promoting `Cube` and `Solver` to interfaces now. Neither near-term Puzzle is a second, structurally different implementation: the 2×2 is a corners-only 3×3, and the Mirror Cube is the 3×3 with a different look. An interface designed against that single implementation would bake in cubic assumptions — six faces, the `face*9 + row*3 + col` Sticker layout, R/L/U/D/F/B Moves — and would almost certainly be wrong for the first genuinely non-cubic Puzzle. We would rather extract the interface from the diff of two real implementations in #41 than design it against one Cube plus imagination.

We do generalize the one thing that is shared across every Puzzle: the output contract. A Scramble becomes a Solution of teachable Stages, which already exists as the `POST /api/solve` request and the Solution/Stage JSON that the browser consumes opaquely. We tag the solve request and the stored Snapshot with a puzzle type so the data is unambiguous and forward-compatible. The Snapshot body (ADR 0003) gains a `type` field and its `version` bumps to 2; a missing `type` reads as the 3×3, so every existing share link is untouched.

## Consequences

- The 2×2 and the Mirror Cube ship without a Puzzle interface; both reuse the `[54]Color` model, the Go Solver, and the shared Go↔TS test cases (ADR 0002).
- Every Snapshot and solve request carries a puzzle type from now on; adding a Puzzle later needs no Snapshot migration.
- Because the model keeps all 54 Stickers, each Puzzle's *presentation* decides which of them are live: a Puzzle exposes only its Live Stickers to selection and keyboard navigation — all nine per face on the 3×3, but only the four corner Stickers per face on the Pocket Cube, never a Phantom Sticker. The selection layer takes the puzzle type; the Sticker arithmetic is untouched.
- #41 owns promoting `Cube` and `Solver` to interfaces, informed by what building the 2×2 and the Mirror Cube teaches about where the 3×3 assumptions bite.

## Considered Options

- **Introduce a `Cube`/`Solver` interface now**: rejected. Designed against a single 3×3 implementation it would encode cubic assumptions and need rewriting at the first non-cubic Puzzle, and the near-term pair gives no second implementation to validate the seam against.
- **Parameterize the model to N×N now**: rejected for this work. The dimension is baked into the Sticker arithmetic, the Piece set, the geometry, and every shared test case; that is #41's problem, not a prerequisite for the 2×2 (corners-only 3×3) or the Mirror Cube (presentation only).
