package tests

import (
	"strings"
	"testing"

	"uptime-lofi-probe/internal/collector"
)

func TestDockerShortSkip(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping Docker tests in short mode")
	}
}

func TestDockerContainersAvailable(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping Docker tests in short mode")
	}

	containers, err := collector.CollectDockerMetrics()
	if err != nil {
		t.Skipf("Docker not available: %v", err)
	}

	if containers == "" {
		t.Fatalf("expected JSON array string, got empty result")
	}
	if !strings.HasPrefix(containers, "[") {
		t.Fatalf("expected JSON array, got %q", containers)
	}
}

func TestDockerContainersUnavailable(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping Docker tests in short mode")
	}

	_, err := collector.CollectDockerMetrics()
	if err == nil {
		t.Skip("Docker is available on this machine; unavailable-path test skipped")
	}
}
