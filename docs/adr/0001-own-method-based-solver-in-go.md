# Cubular writes its own method-based solver in Go

Cubular is a tutor, so a Solution follows the beginner's layer-by-layer Method and is split into Stages. A shortest-possible solution of about 20 Moves looks random and teaches nothing. No library we can import does this: the Go projects with human-method solvers (ehrlich-b/cube and danielriddell21/rubix, both MIT) keep them in `internal/` packages, and no JS or TS package returns a beginner solve labeled by Stage. So we write the solver ourselves in the Go backend, using ehrlich-b/cube as a reference.

## Considered Options

- **Two-phase (Kociemba) solver**, for example `github.com/unixpickle/gocube` (BSD-2-Clause): gives short solutions with no Stages. We may add it later as an optional "shortest solution" mode, but never as the default.
- **cubing.js solver in the browser** (MPL-2.0): also two-phase, with no Stages.
