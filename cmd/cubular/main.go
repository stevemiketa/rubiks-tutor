// Command cubular runs the Cubular web server: the API, the health endpoints
// and the embedded frontend.
//
// Configuration comes from the environment:
//
//	PORT                  the TCP port to listen on (default 8080; 0 picks a
//	                      free port)
//	DATABASE_URL          where Snapshots are stored: a SQLite file
//	                      (default sqlite:cubular.db, in the working
//	                      directory) or a postgres:// URL; see store.Open.
//	                      GET /readyz checks it
//	PUBLIC_BASE_URL       where share links point, such as
//	                      https://cubular.example (default: the address
//	                      each request was sent to, as a trusted proxy's
//	                      X-Forwarded-Proto and X-Forwarded-Host say; a
//	                      warning is logged at startup)
//	TRUSTED_PROXIES       comma-separated CIDR ranges or addresses whose
//	                      X-Forwarded-* headers are believed (default
//	                      none)
//	SHARE_LIMIT_PER_HOUR  how many Snapshots one client may share an hour
//	                      (default 30)
//	SHARE_LIMIT_BURST     how many it may share at once (default 10)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/stevemiketa/rubiks-tutor/internal/server"
	"github.com/stevemiketa/rubiks-tutor/internal/store"
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
	cfg, err := serverConfig(getenv)
	if err != nil {
		return err
	}

	frontend, err := web.Dist()
	if err != nil {
		return err
	}
	cfg.Frontend = frontend
	cfg.Logger = logger

	databaseURL := getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = store.DefaultURL
	}
	snapshots, err := store.Open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer func() {
		if err := snapshots.Close(); err != nil {
			logger.Error("closing the database", "err", err)
		}
	}()
	cfg.Snapshots = snapshots
	cfg.Ready = snapshots.Ping

	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("listening on port %s: %w", port, err)
	}
	srv := &http.Server{
		Handler:           server.New(cfg),
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

// serverConfig reads the router's settings from the environment.
func serverConfig(getenv func(string) string) (server.Config, error) {
	var cfg server.Config

	if base := getenv("PUBLIC_BASE_URL"); base != "" {
		u, err := url.Parse(base)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.RawQuery != "" || u.Fragment != "" {
			return cfg, fmt.Errorf("PUBLIC_BASE_URL %q must be an http or https URL with no query, such as https://cubular.example", base)
		}
		cfg.PublicBaseURL = base
	}

	for entry := range strings.SplitSeq(getenv("TRUSTED_PROXIES"), ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(entry)
		if err != nil {
			addr, addrErr := netip.ParseAddr(entry)
			if addrErr != nil {
				return cfg, fmt.Errorf("TRUSTED_PROXIES: %q is not a CIDR range or an IP address", entry)
			}
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		cfg.TrustedProxies = append(cfg.TrustedProxies, prefix.Masked())
	}

	// A limit left unset stays zero, which server.New reads as its default.
	if v := getenv("SHARE_LIMIT_PER_HOUR"); v != "" {
		perHour, err := strconv.ParseFloat(v, 64)
		if err != nil || !(perHour > 0) {
			return cfg, fmt.Errorf("SHARE_LIMIT_PER_HOUR %q must be a number above 0", v)
		}
		cfg.ShareLimit.PerHour = perHour
	}
	if v := getenv("SHARE_LIMIT_BURST"); v != "" {
		burst, err := strconv.Atoi(v)
		if err != nil || burst < 1 {
			return cfg, fmt.Errorf("SHARE_LIMIT_BURST %q must be a whole number above 0", v)
		}
		cfg.ShareLimit.Burst = burst
	}
	return cfg, nil
}
