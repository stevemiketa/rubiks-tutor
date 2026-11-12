BIN := bin/cubular
# npm writes this file on every install, so it is newer than the lockfile
# whenever node_modules is up to date.
NODE_DEPS := web/node_modules/.package-lock.json

.DEFAULT_GOAL := help
.PHONY: help deps build run test-go typecheck test-web e2e-browsers e2e gate clean

help: ## List the targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-13s %s\n", $$1, $$2}'

$(NODE_DEPS): web/package.json web/package-lock.json
	cd web && npm ci

deps: $(NODE_DEPS) ## Install the frontend's npm dependencies

build: $(NODE_DEPS) ## Build the frontend, then the Go binary with it embedded
	cd web && npm run build
	go build -o $(BIN) ./cmd/cubular

run: build ## Build everything and run the server on $$PORT (default 8080)
	./$(BIN)

test-go: ## Gate: gofmt check, go vet and Go tests
	@unformatted="$$(gofmt -l $$(go list -f '{{.Dir}}' ./...))"; \
	  if [ -n "$$unformatted" ]; then echo "gofmt needed:"; echo "$$unformatted"; exit 1; fi
	go vet ./...
	go test ./...

typecheck: $(NODE_DEPS) ## Gate: TypeScript type-check
	cd web && npm run typecheck

test-web: $(NODE_DEPS) ## Gate: Vitest
	cd web && npm test

e2e-browsers: $(NODE_DEPS) ## Install the browser Playwright uses (no-op once installed)
	cd web && npx playwright install chromium

e2e: build e2e-browsers ## Gate: Playwright journeys against the built binary
	cd web && npm run e2e

gate: test-go typecheck test-web e2e ## Run the whole gate, as CI does

clean: ## Remove build output
	rm -rf bin web/dist/site web/playwright-report web/test-results
