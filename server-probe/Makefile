VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -s -w -X main.version=$(VERSION)
BINARY  := probe
PLATFORMS := linux/amd64 linux/arm64 darwin/amd64 darwin/arm64

.PHONY: build build-all clean

build:
	go build -ldflags="$(LDFLAGS)" -o $(BINARY) ./cmd/probe/

build-all:
	@for platform in $(PLATFORMS); do \
		os=$$(echo $$platform | cut -d/ -f1); \
		arch=$$(echo $$platform | cut -d/ -f2); \
		output="$(BINARY)-$$os-$$arch"; \
		echo "Building $$output..."; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch \
			go build -ldflags="$(LDFLAGS)" -o $$output ./cmd/probe/; \
		tar -czf "$$output.tar.gz" "$$output"; \
		rm "$$output"; \
	done
	sha256sum *.tar.gz > checksums.txt

clean:
	rm -f $(BINARY) $(BINARY)-* *.tar.gz checksums.txt
