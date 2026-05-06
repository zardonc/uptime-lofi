package collector

import (
	"context"
	"encoding/json"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerInfo struct {
	Id     string `json:"id"`
	Name   string `json:"name"`
	Image  string `json:"image"`
	State  string `json:"state"`
	Status string `json:"status"`
}

type ContainerListFunc func(context.Context, container.ListOptions) ([]container.Summary, error)

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

	return CollectDockerMetricsWithList(cli.ContainerList)
}

func CollectDockerMetricsWithList(listContainers ContainerListFunc) (string, error) {
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
		results = append(results, ContainerInfo{
			Id:     shortContainerID(c.ID),
			Name:   name,
			Image:  c.Image,
			State:  c.State,
			Status: c.Status,
		})
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
