package tests

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"

	"uptime-lofi-probe/internal/collector"
)

func TestDockerCollectsContainerFieldsFromFakeList(t *testing.T) {
	jsonText, err := collector.CollectDockerMetricsWithList(func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
		return []container.Summary{
			{ID: "1234567890abcdef", Names: []string{"/web"}, Image: "nginx:1.27", State: "running", Status: "Up 5 minutes"},
			{ID: "abcdef1234567890", Names: []string{"/worker"}, Image: "busybox:latest", State: "exited", Status: "Exited (0) 1 hour ago"},
		}, nil
	})
	if err != nil {
		t.Fatalf("expected fake list to succeed, got %v", err)
	}

	var containers []map[string]string
	if err := json.Unmarshal([]byte(jsonText), &containers); err != nil {
		t.Fatalf("expected valid JSON array, got %q: %v", jsonText, err)
	}

	if len(containers) != 2 {
		t.Fatalf("expected 2 containers, got %d", len(containers))
	}
	first := containers[0]
	if first["id"] != "1234567890" || first["name"] != "/web" || first["image"] != "nginx:1.27" || first["state"] != "running" || first["status"] != "Up 5 minutes" {
		t.Fatalf("unexpected first container fields: %#v", first)
	}
}

func TestDockerUnavailableReturnsError(t *testing.T) {
	expected := errors.New("docker unavailable")
	_, err := collector.CollectDockerMetricsWithList(func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
		return nil, expected
	})
	if !errors.Is(err, expected) {
		t.Fatalf("expected docker unavailable error, got %v", err)
	}
}

func TestDockerEmptyListSerializesToArray(t *testing.T) {
	jsonText, err := collector.CollectDockerMetricsWithList(func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
		return []container.Summary{}, nil
	})
	if err != nil {
		t.Fatalf("expected empty fake list to succeed, got %v", err)
	}
	if jsonText != "[]" {
		t.Fatalf("expected empty list to serialize as [], got %q", jsonText)
	}
}

func TestDockerShortContainerIdDoesNotPanic(t *testing.T) {
	jsonText, err := collector.CollectDockerMetricsWithList(func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
		return []container.Summary{{ID: "short", Names: []string{"/tiny"}, Image: "scratch", State: "created", Status: "Created"}}, nil
	})
	if err != nil {
		t.Fatalf("expected short fake ID to succeed, got %v", err)
	}

	var containers []map[string]string
	if err := json.Unmarshal([]byte(jsonText), &containers); err != nil {
		t.Fatalf("expected valid JSON array, got %q: %v", jsonText, err)
	}
	if containers[0]["id"] != "short" {
		t.Fatalf("expected short ID to be preserved, got %#v", containers[0])
	}
}

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
