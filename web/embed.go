// Package web holds Cubular's built frontend, embedded in the binary.
//
// Vite builds into dist/site (`make build`). The committed dist/README.md keeps
// the go:embed pattern matching before the first build, so the Go packages
// compile and test without Node.
package web

import (
	"embed"
	"errors"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// ErrNotBuilt means the binary was compiled before the frontend was built.
var ErrNotBuilt = errors.New("frontend not built: run `make build`")

// Dist returns the built frontend, with index.html at its root.
func Dist() (fs.FS, error) {
	site, err := fs.Sub(dist, "dist/site")
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(site, "index.html"); err != nil {
		return nil, ErrNotBuilt
	}
	return site, nil
}
