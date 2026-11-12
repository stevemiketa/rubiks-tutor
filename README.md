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
| `DATABASE_URL` | `sqlite:cubular.db` | Where Snapshots are stored. `sqlite:<path>` is a SQLite file, created if missing; the path is relative to the working directory unless it starts with `/`, as in `sqlite:///var/lib/cubular/cubular.db`. A `postgres://` or `postgresql://` URL is a Postgres database, as in `postgres://cubular:<password>@db.example:5432/cubular?sslmode=require`; production uses Postgres so that replicas can share it. Migrations run at startup, one process at a time, and `GET /readyz` answers 503 while the database can't be reached, after waiting at most a second for it |
| `PUBLIC_BASE_URL` | the request's own address | Where share links point, such as `https://cubular.example` |
| `TRUSTED_PROXIES` | none | Comma-separated CIDR ranges or addresses whose `X-Forwarded-For` headers are believed when rate limiting. Requests from anywhere else count as coming from their connection's address |
| `SHARE_LIMIT_PER_HOUR` | `30` | How many Snapshots one client may share an hour, per replica. IPv6 clients are counted per /64 |
| `SHARE_LIMIT_BURST` | `10` | How many Snapshots one client may share at once |

Logs are structured JSON on stdout, one line per request.

## Snapshots and the store suite

A share link points to a Snapshot stored on the server under an ID made from a hash of its contents ([ADR 0003](docs/adr/0003-server-stored-snapshots.md)). Snapshots are never changed or deleted, so the database must never be dropped or wiped.

Every Snapshot store runs the same contract suite, `internal/snapshot/storetest` ([ADR 0004](docs/adr/0004-sqlite-locally-postgres-in-production.md)). `make test-go` always runs it against SQLite, and against Postgres too when `CUBULAR_TEST_POSTGRES_URL` names a Postgres database; CI sets it, using a Postgres service container. Its ID-collision case uses two Snapshots found by `go run ./internal/snapshot/storetest/findcollision.go`, which only needs rerunning if the Snapshot body format gets a new version.

## Running against Postgres locally

Production stores Snapshots in Postgres. To reproduce a production-only problem, start a throwaway Postgres in Docker and point `DATABASE_URL` at it:

```sh
docker run --rm -d --name cubular-postgres -e POSTGRES_PASSWORD=cubular -p 127.0.0.1:5432:5432 postgres:18-alpine
DATABASE_URL='postgres://postgres:cubular@localhost:5432/postgres?sslmode=disable' make run
```

Cubular creates its tables on startup. `docker stop cubular-postgres` throws the database away. Use another host port, such as `-p 127.0.0.1:55432:5432` and `localhost:55432` in the URL, if 5432 is taken.

To run the Postgres tests against the same database:

```sh
CUBULAR_TEST_POSTGRES_URL='postgres://postgres:cubular@localhost:5432/postgres?sslmode=disable' make test-go
```

They need a user who may create schemas: each test works in a new schema, which it drops when it ends, so they leave nothing behind. Several runs can share one database at once. Without `CUBULAR_TEST_POSTGRES_URL` they're skipped, except in CI (where `CI` is set), where they fail.

## Layout

| Path | Contents |
|---|---|
| `cmd/cubular/` | The server's entry point: configuration, listening, graceful shutdown |
| `internal/server/` | The HTTP router and its tests, which drive it in-process, including the solver's property tests through `POST /api/solve`, share rate limiting, and working out client addresses behind trusted proxies |
| `internal/snapshot/` | Snapshots: validation, the canonical body and its IDs, and the `Store` interface, with its contract suite in `storetest/` |
| `internal/store/` | The SQL Snapshot store: SQLite or Postgres, chosen by `DATABASE_URL`, with migrations in `migrations/<database>/` embedded in the binary. `pgtest/` gives tests the Postgres database in `CUBULAR_TEST_POSTGRES_URL` |
| `internal/cube/` | The Go cube model: Cube state, notation, Moves, relabeling and Pieces. Its package doc defines the Sticker layout both models share |
| `internal/solver/` | The beginner's-Method solver ([ADR 0001](docs/adr/0001-own-method-based-solver-in-go.md)): a pipeline of Stages, each with its goal, Moves, notes, Algorithms and Pieces |
| `testdata/cube/` | The shared cube test cases, which both cube models must pass |
| `web/` | The React frontend (Vite, TypeScript) |
| `web/embed.go` | Embeds the built frontend (`web/dist/site/`) into the binary |
| `web/src/cube/` | The TypeScript cube model, the same as the Go one |
| `web/src/session/` | The Session model, with no rendering code: the Session with undo and redo, Scrambles, saving the Session in browser storage, the turning, rotating and selection controls, snapping a drag to Cube rotations, the queue of Moves to animate, Solutions from the solver and Playback through them, sharing and opening Snapshots, and `Tutor`, which the tutor page reads |
| `web/src/scene/` | The 3D Cube (react-three-fiber), which animates a queue of Moves; shared by the tutor and the splash page |
| `web/src/tutor/` | The tutor page's controls and panels |
| `web/src/splash/` | The splash page's prerecorded scramble-and-solve, and the loop that plays it |
| `web/src/routing/` | Client-side routing between the splash page and the tutor |
| `web/e2e/` | Playwright journeys |

## Shared cube test cases

The cube model exists twice, in Go and in TypeScript ([ADR 0002](docs/adr/0002-cube-model-in-go-and-typescript.md)). Each JSON file in `testdata/cube/` holds one kind of case and describes its own fields. `make test-go` and `make test-web` each load every file, so CI fails if either model disagrees with any case. A file of an unknown kind, or a case with a missing or unknown field, fails both suites instead of being skipped.

A change to Moves or notation updates both models and the case files in the same change. Take a new case's expected values from a source other than the models, such as a published pattern or a hand derivation.

## Frontend development

`cd web && npm run dev` starts Vite's dev server with hot reload for the frontend alone. It doesn't proxy to the Go server.
