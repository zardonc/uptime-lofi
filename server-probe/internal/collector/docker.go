package collector

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerInfo struct {
	Id         string   `json:"id"`
	Name       string   `json:"name"`
	Image      string   `json:"image"`
	State      string   `json:"state"`
	Status     string   `json:"status"`
	CpuPercent *float64 `json:"cpu_percent,omitempty"`
	MemPercent *float64 `json:"mem_percent,omitempty"`
}

type ContainerListFunc func(context.Context, container.ListOptions) ([]container.Summary, error)
type ContainerStatsFunc func(context.Context, string) (container.StatsResponse, error)

func shortContainerID(id string) string {
	if len(id) <= 10 {
		return id
	}
	return id[:10]
}

// CollectDockerMetrics interfaces with the host docker daemon.
// Crucially, it swallows errors cleanly to prevent Probe panics on environments without docker.
func CollectDockerMetrics() (string, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return "", err
	}
	defer cli.Close()

	return CollectDockerMetricsWithListAndStats(cli.ContainerList, func(ctx context.Context, containerID string) (container.StatsResponse, error) {
		statsReader, err := cli.ContainerStats(ctx, containerID, false)
		if err != nil {
			return container.StatsResponse{}, err
		}
		defer statsReader.Body.Close()

		var stats container.StatsResponse
		if err := json.NewDecoder(statsReader.Body).Decode(&stats); err != nil {
			return container.StatsResponse{}, err
		}
		return stats, nil
	})
}

func CollectDockerMetricsWithList(listContainers ContainerListFunc) (string, error) {
	return CollectDockerMetricsWithListAndStats(listContainers, nil)
}

func CollectDockerMetricsWithListAndStats(listContainers ContainerListFunc, getStats ContainerStatsFunc) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	containers, err := listContainers(ctx, container.ListOptions{All: true})
	if err != nil {
		return "", err
	}

	var results []ContainerInfo
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = c.Names[0]
		}
		info := ContainerInfo{
			Id:     shortContainerID(c.ID),
			Name:   name,
			Image:  c.Image,
			State:  c.State,
			Status: c.Status,
		}

		if getStats != nil && c.State == "running" {
			if stats, err := getStats(ctx, c.ID); err == nil {
				info.CpuPercent = calculateDockerCPUPercent(stats)
				info.MemPercent = calculateDockerMemoryPercent(stats)
			}
		}

		results = append(results, info)
	}
	if results == nil {
		results = []ContainerInfo{}
	}

	bytes, err := json.Marshal(results)
	if err != nil {
		return "", err
	}

	return string(bytes), nil
}

func calculateDockerCPUPercent(stats container.StatsResponse) *float64 {
	currentCPU := stats.CPUStats.CPUUsage.TotalUsage
	previousCPU := stats.PreCPUStats.CPUUsage.TotalUsage
	currentSystem := stats.CPUStats.SystemUsage
	previousSystem := stats.PreCPUStats.SystemUsage

	if currentCPU < previousCPU || currentSystem <= previousSystem {
		return nil
	}

	cpuDelta := float64(currentCPU - previousCPU)
	systemDelta := float64(currentSystem - previousSystem)
	if cpuDelta < 0 || systemDelta <= 0 {
		return nil
	}

	onlineCPUs := float64(stats.CPUStats.OnlineCPUs)
	if onlineCPUs == 0 {
		onlineCPUs = float64(len(stats.CPUStats.CPUUsage.PercpuUsage))
	}
	if onlineCPUs == 0 {
		return nil
	}

	percent := (cpuDelta / systemDelta) * onlineCPUs * 100
	return roundedPercent(percent)
}

func calculateDockerMemoryPercent(stats container.StatsResponse) *float64 {
	limit := stats.MemoryStats.Limit
	if limit == 0 {
		return nil
	}

	usage := stats.MemoryStats.Usage
	if inactiveFile, ok := stats.MemoryStats.Stats["total_inactive_file"]; ok && inactiveFile < usage {
		usage -= inactiveFile
	} else if cache, ok := stats.MemoryStats.Stats["cache"]; ok && cache < usage {
		usage -= cache
	}

	percent := (float64(usage) / float64(limit)) * 100
	return roundedPercent(percent)
}

func roundedPercent(value float64) *float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return nil
	}
	rounded := math.Round(value*10) / 10
	return &rounded
}
