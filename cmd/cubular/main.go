// Command cubular runs the Cubular web server: the API, the health endpoints
// and the embedded frontend.
//
// Configuration comes from the environment:
//
//	PORT  the TCP port to listen on (default 8080; 0 picks a free port)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
	"github.com/stevemiketa/rubiks-tutor/web"
)

const shutdownTimeout = 10 * time.Second

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, logger, os.Getenv); err != nil {
		logger.Error("exiting", "err", err)
		os.Exit(1)
	}
}

// run serves until ctx is cancelled, then shuts down gracefully.
func run(ctx context.Context, logger *slog.Logger, getenv func(string) string) error {
	port := getenv("PORT")
	if port == "" {
		port = "8080"
	}

	frontend, err := web.Dist()
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("listening on port %s: %w", port, err)
	}
	srv := &http.Server{
		Handler:           server.New(server.Config{Frontend: frontend, Logger: logger}),
		ReadHeaderTimeout: 5 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(ln) }()
	// The e2e suite reads the bound address from this line.
	logger.Info("listening", "addr", ln.Addr().String())

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutting down: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
