# syntax=docker/dockerfile:1

# Cubular's image: Node builds the frontend, Go builds the server with that
# frontend embedded, and the server runs alone on a distroless base as a
# non-root user. Keep the Node major version in step with .nvmrc, and the Go
# version with go.mod.
#
# Both build stages run on the build machine's own platform and the Go
# stage cross-compiles, so building for another architecture (CI builds
# linux/amd64 and linux/arm64) needs no emulation.

FROM --platform=$BUILDPLATFORM node:26-trixie-slim AS frontend
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine AS server
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
COPY --from=frontend /src/web/dist/site web/dist/site
ARG TARGETOS TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags='-s -w' -o /out/cubular ./cmd/cubular

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=server /out/cubular /cubular
# The distroless nonroot user. It's numeric so that Kubernetes can check
# runAsNonRoot. Its home, the working directory, is writable, so the default
# DATABASE_URL (a SQLite file there) works for a quick `docker run`.
USER 65532:65532
WORKDIR /home/nonroot
EXPOSE 8080
ENTRYPOINT ["/cubular"]
