package tests

import (
	"context"
	"encoding/json"
	"errors"
	"log"
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

func TestDockerCollectsCPUAndMemoryStatsForRunningContainers(t *testing.T) {
	jsonText, err := collector.CollectDockerMetricsWithListAndStats(
		func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
			return []container.Summary{
				{ID: "1234567890abcdef", Names: []string{"/web"}, Image: "nginx:1.27", State: "running", Status: "Up 5 minutes"},
				{ID: "abcdef1234567890", Names: []string{"/worker"}, Image: "busybox:latest", State: "exited", Status: "Exited (0) 1 hour ago"},
			}, nil
		},
		func(ctx context.Context, containerID string) (container.StatsResponse, error) {
			if containerID != "1234567890abcdef" {
				t.Fatalf("stats should only be requested for the running container, got %s", containerID)
			}
			return container.StatsResponse{
				CPUStats: container.CPUStats{
					CPUUsage:    container.CPUUsage{TotalUsage: 150_000_000},
					SystemUsage: 1_000_000_000,
					OnlineCPUs:  4,
				},
				PreCPUStats: container.CPUStats{
					CPUUsage:    container.CPUUsage{TotalUsage: 100_000_000},
					SystemUsage: 500_000_000,
				},
				MemoryStats: container.MemoryStats{
					Usage: 600,
					Limit: 1000,
					Stats: map[string]uint64{"total_inactive_file": 100},
				},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected fake list and stats to succeed, got %v", err)
	}

	var containers []map[string]any
	if err := json.Unmarshal([]byte(jsonText), &containers); err != nil {
		t.Fatalf("expected valid JSON array, got %q: %v", jsonText, err)
	}

	if containers[0]["cpu_percent"] != 40.0 {
		t.Fatalf("expected running container CPU percent, got %#v", containers[0])
	}
	if containers[0]["mem_percent"] != 50.0 {
		t.Fatalf("expected running container memory percent, got %#v", containers[0])
	}
	if _, exists := containers[1]["cpu_percent"]; exists {
		t.Fatalf("expected exited container to omit CPU percent, got %#v", containers[1])
	}
	if _, exists := containers[1]["mem_percent"]; exists {
		t.Fatalf("expected exited container to omit memory percent, got %#v", containers[1])
	}
}

func TestDockerCollectsCPUWhenOnlineCPUCountIsMissing(t *testing.T) {
	jsonText, err := collector.CollectDockerMetricsWithListAndStats(
		func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
			return []container.Summary{{ID: "1234567890abcdef", Names: []string{"/web"}, Image: "nginx:1.27", State: "running", Status: "Up 5 minutes"}}, nil
		},
		func(ctx context.Context, containerID string) (container.StatsResponse, error) {
			return container.StatsResponse{
				CPUStats: container.CPUStats{
					CPUUsage:    container.CPUUsage{TotalUsage: 150_000_000},
					SystemUsage: 1_000_000_000,
				},
				PreCPUStats: container.CPUStats{
					CPUUsage:    container.CPUUsage{TotalUsage: 100_000_000},
					SystemUsage: 500_000_000,
				},
				MemoryStats: container.MemoryStats{Usage: 600, Limit: 1000},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected fake list and stats to succeed, got %v", err)
	}

	var containers []map[string]any
	if err := json.Unmarshal([]byte(jsonText), &containers); err != nil {
		t.Fatalf("expected valid JSON array, got %q: %v", jsonText, err)
	}
	if containers[0]["cpu_percent"] == nil {
		t.Fatalf("expected CPU percent fallback when Docker omits online CPU count, got %#v", containers[0])
	}
	if containers[0]["mem_percent"] != 60.0 {
		t.Fatalf("expected memory percent, got %#v", containers[0])
	}
}

func TestDockerStatsFailuresAreLoggedAndDoNotDropContainerState(t *testing.T) {
	var logBuffer strings.Builder
	originalOutput := log.Writer()
	log.SetOutput(&logBuffer)
	t.Cleanup(func() { log.SetOutput(originalOutput) })

	jsonText, err := collector.CollectDockerMetricsWithListAndStats(
		func(ctx context.Context, options container.ListOptions) ([]container.Summary, error) {
			return []container.Summary{{ID: "1234567890abcdef", Names: []string{"/web"}, Image: "nginx:1.27", State: "running", Status: "Up 5 minutes"}}, nil
		},
		func(ctx context.Context, containerID string) (container.StatsResponse, error) {
			return container.StatsResponse{}, errors.New("stats denied")
		},
	)
	if err != nil {
		t.Fatalf("expected container list to succeed despite stats failure, got %v", err)
	}

	var containers []map[string]any
	if err := json.Unmarshal([]byte(jsonText), &containers); err != nil {
		t.Fatalf("expected valid JSON array, got %q: %v", jsonText, err)
	}
	if containers[0]["state"] != "running" || containers[0]["cpu_percent"] != nil || containers[0]["mem_percent"] != nil {
		t.Fatalf("expected state without stats fields, got %#v", containers[0])
	}
	if !strings.Contains(logBuffer.String(), "[Docker Warn] stats failed") {
		t.Fatalf("expected stats failure warning, got %q", logBuffer.String())
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
