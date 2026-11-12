# Deploying Cubular

Cubular ships as one container image, `ghcr.io/stevemiketa/rubiks-tutor`, and deploys to Kubernetes with kustomize:

| Path | Contents |
|---|---|
| `base/` | A Deployment of 2 replicas with liveness and readiness probes and resource requests, its Service, and a ConfigMap of settings |
| `overlays/self-hosted/` | The base plus an Ingress with TLS, for the self-hosted cluster |

The manifests don't provision Postgres. You provide the database, and Cubular reaches it through a Secret ([ADR 0004](../docs/adr/0004-sqlite-locally-postgres-in-production.md)).

## The image

The `Dockerfile` builds the frontend with Node, builds the Go binary with the frontend embedded, and copies the binary alone onto a distroless base. The server runs as the non-root user 65532, and with a Postgres `DATABASE_URL` it writes nothing to its filesystem.

On every push to `master`, the `Image` workflow builds the image for linux/amd64 and linux/arm64, smoke-tests it, and pushes it to GHCR, tagged with the full commit SHA. Pull requests build and smoke-test it without pushing.

To build and run it locally:

```sh
docker build -t cubular .
docker run --rm -p 8080:8080 cubular
```

Without `DATABASE_URL`, it keeps Snapshots in a SQLite file inside the container, which is lost when the container goes.

New GHCR packages are private. Make the package public in its settings, or give the Deployment an `imagePullSecrets` entry for a Secret that can pull it.

## What to provide before applying

1. **A Postgres database**, and a user that may create tables in its schema. Cubular applies its own migrations at startup, one replica at a time, so upgrades need no manual step. Never drop or wipe the database: every share link points at a row in it.
2. **The Secret `cubular-database`**, with the connection URL under the key `DATABASE_URL`, in the namespace you deploy to:

   ```sh
   kubectl create secret generic cubular-database \
     --from-literal=DATABASE_URL='postgres://cubular:<password>@db.example:5432/cubular?sslmode=require'
   ```

   Any URL form the pgx driver accepts works; `postgresql://` is the same as `postgres://`. Pods don't start without this Secret.
3. **A TLS Secret** of type `kubernetes.io/tls` for the host, made with `kubectl create secret tls cubular-tls --cert=<file> --key=<file>`, or issued by cert-manager if you add its `cert-manager.io/cluster-issuer` annotation to the Ingress.
4. **An ingress controller.** The Ingress uses the cluster's default IngressClass. Set `spec.ingressClassName` in `ingress.yaml` to use another.

## Overlay values

Fill these in in `overlays/self-hosted/`, where each is marked "Fill in":

| Value | Where | Placeholder | What to put |
|---|---|---|---|
| Host | `ingress.yaml`: `tls[].hosts` and `rules[].host` | `cubular.example.com` | The host name Cubular is served on |
| TLS Secret | `ingress.yaml`: `tls[].secretName` | `cubular-tls` | The name of the TLS Secret for that host |
| `PUBLIC_BASE_URL` | `kustomization.yaml`: `configMapGenerator` | `https://cubular.example.com` | `https://` and the host. Share links are built from it |
| `TRUSTED_PROXIES` | `kustomization.yaml`: `configMapGenerator` | `10.42.0.0/16` | The CIDR range the ingress controller connects to Cubular from: its Pods' range (`10.42.0.0/16` is k3s's default), or the nodes' addresses if it uses host networking. Separate several with commas |
| Image tag | `kustomization.yaml`: `images[].newTag` | `COMMIT_SHA` | The full SHA of a `master` commit whose `Image` workflow succeeded |

Cubular believes `X-Forwarded-For` only from `TRUSTED_PROXIES`, and rate-limits sharing by the client address it finds there. If the range misses the ingress controller, every client looks like the controller and they all share one limit. If it's wider than the controllers, anything else in it can forge client addresses. The controller must also see the real client address: behind a load balancer, that can mean `externalTrafficPolicy: Local` on the controller's Service, or the PROXY protocol.

The other settings are optional and live in `base/kustomization.yaml`: `SHARE_LIMIT_PER_HOUR` (default 30) and `SHARE_LIMIT_BURST` (default 10). Override them by adding literals to the overlay's `configMapGenerator`. Each replica counts separately, so a client may share up to twice as many with 2 replicas. To deploy into a namespace, add `namespace: <name>` to the overlay's `kustomization.yaml`, and create the Secrets there.

## Applying

```sh
kubectl apply -k deploy/overlays/self-hosted
kubectl rollout status deployment/cubular
```

Each replica's liveness probe calls `GET /healthz`, which checks only that the server answers. The readiness probe calls `GET /readyz`, which also checks the database and answers within about a second even when the database doesn't, so its 2-second timeout is enough. A replica that can't reach the database stops getting traffic until it can again. Logs are JSON on stdout.

## Checking the manifests

`make check-manifests` builds the overlay with kustomize and validates the result with kubeconform against the Kubernetes 1.35 schemas, rejecting unknown fields. The Makefile pins both tools and runs them with `go run`, so they need no installing; the first run downloads them, and the schemas, which it caches in `bin/`. CI runs it on every pull request. `kubectl kustomize deploy/overlays/self-hosted` prints what would be applied.
