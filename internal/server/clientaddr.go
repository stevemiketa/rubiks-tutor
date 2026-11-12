package server

import (
	"net/http"
	"net/netip"
	"slices"
	"strings"
)

// clientAddr is the address a request came from. That is the connection's
// address, unless the connection is from a trusted proxy: then it is the
// last address in X-Forwarded-For that isn't a trusted proxy. Each proxy
// appends the address it received the request from, so everything to the
// left of the first untrusted address could have been written by the client
// and is ignored.
func clientAddr(r *http.Request, trusted []netip.Prefix) netip.Addr {
	addr := parseHop(r.RemoteAddr)
	if !addr.IsValid() {
		return addr
	}
	var hops []string
	for _, header := range r.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(header, ",")...)
	}
	for _, hop := range slices.Backward(hops) {
		if !isTrusted(addr, trusted) {
			break
		}
		next := parseHop(strings.TrimSpace(hop))
		if !next.IsValid() {
			// A trusted proxy wouldn't write this, so stop at that proxy.
			break
		}
		addr = next
	}
	return addr
}

func isTrusted(addr netip.Addr, trusted []netip.Prefix) bool {
	for _, p := range trusted {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

// parseHop reads an address as it appears in RemoteAddr or X-Forwarded-For:
// an IP address, optionally in brackets or with a port. IPv4 written as IPv6
// is read as IPv4. It returns the zero Addr if s is none of these.
func parseHop(s string) netip.Addr {
	if ap, err := netip.ParseAddrPort(s); err == nil {
		return ap.Addr().Unmap()
	}
	if a, err := netip.ParseAddr(strings.TrimSuffix(strings.TrimPrefix(s, "["), "]")); err == nil {
		return a.Unmap()
	}
	return netip.Addr{}
}

// rateLimitKey is the range of addresses that share a rate limit with addr:
// the address itself for IPv4, and its /64 for IPv6, since one IPv6 client
// is usually given a whole /64.
func rateLimitKey(addr netip.Addr) netip.Prefix {
	bits := 32
	if addr.Is6() {
		bits = 64
	}
	p, _ := addr.Prefix(bits) // the zero Addr gives the zero Prefix, one shared key
	return p
}
