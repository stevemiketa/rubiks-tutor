# Cubular

Cubular is a 3D tutor that teaches people to solve a 3×3×3 Cube by walking them through the beginner's layer-by-layer Method, one Stage at a time. Vocabulary is defined in [`GLOSSARY.md`](GLOSSARY.md), and decisions are recorded in [`docs/adr/`](docs/adr/).

A Go server serves the API and the React frontend, which is built with Vite and embedded in the Go binary.

## Prerequisites

- Go (the version in `go.mod`)
- Node.js 24 or later (`.nvmrc` pins the version CI uses)
- `make`

## Run it locally

```sh
make run
```

This installs the npm dependencies if needed, builds the frontend, builds `bin/cubular` with the frontend embedded, and starts it on <http://localhost:8080>. Set `PORT` to use another port: `PORT=3000 make run`.

## Gate

Each gate step has its own command, and CI runs the same ones on every pull request:

| Step | Command | What it runs |
|---|---|---|
| Go tests | `make test-go` | `gofmt` check, `go vet ./...`, `go test ./...` |
| Type-check | `make typecheck` | `tsc -b` in `web/` |
| Vitest | `make test-web` | `vitest run` in `web/` |
| Playwright | `make e2e` | builds the binary, then runs the browser journeys in `web/e2e/` against it |
| **Whole gate** | `make gate` | all of the above, in that order |

`make help` lists every target.

The Playwright suite starts the binary itself with `PORT=0`, so the OS picks a free port, and reads the address from the server's `listening` log line. Several suites can run at the same time, in different worktrees, without colliding. These environment variables change what it tests:

- `CUBULAR_BIN`: the binary to start (default `bin/cubular`)
- `CUBULAR_BASE_URL`: test a server that's already running instead of starting one
- `CUBULAR_E2E_LOGS=1`: print the server's logs

The first `make e2e` downloads Chromium for Playwright.

## Configuration

The server reads its configuration from environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | TCP port to listen on; `0` picks a free one |

Logs are structured JSON on stdout, one line per request.

## Layout

| Path | Contents |
|---|---|
| `cmd/cubular/` | The server's entry point: configuration, listening, graceful shutdown |
| `internal/server/` | The HTTP router and its tests, which drive it in-process |
| `internal/cube/` | The Go cube model: Cube state, notation, Moves, relabeling and Pieces. Its package doc defines the Sticker layout both models share |
| `testdata/cube/` | The shared cube test cases, which both cube models must pass |
| `web/` | The React frontend (Vite, TypeScript) |
| `web/embed.go` | Embeds the built frontend (`web/dist/site/`) into the binary |
| `web/src/cube/` | The TypeScript cube model, the same as the Go one |
| `web/src/session/` | The Session model, with no rendering code: the Session with undo and redo, the turning, rotating and selection controls, snapping a drag to Cube rotations, the queue of Moves to animate, and `Tutor`, which the tutor page reads |
| `web/src/scene/` | The 3D Cube (react-three-fiber), which animates a queue of Moves; shared by the tutor and the splash page |
| `web/src/tutor/` | The tutor page's controls and panels |
| `web/src/routing/` | Client-side routing between the splash page and the tutor |
| `web/e2e/` | Playwright journeys |

## Shared cube test cases

The cube model exists twice, in Go and in TypeScript ([ADR 0002](docs/adr/0002-cube-model-in-go-and-typescript.md)). Each JSON file in `testdata/cube/` holds one kind of case and describes its own fields. `make test-go` and `make test-web` each load every file, so CI fails if either model disagrees with any case. A file of an unknown kind, or a case with a missing or unknown field, fails both suites instead of being skipped.

A change to Moves or notation updates both models and the case files in the same change. Take a new case's expected values from a source other than the models, such as a published pattern or a hand derivation.

## Frontend development

`cd web && npm run dev` starts Vite's dev server with hot reload for the frontend alone. It doesn't proxy to the Go server.
