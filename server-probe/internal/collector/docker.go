package collector

import (
	"context"
	"encoding/json"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerInfo struct {
	Id    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

// CollectDockerMetrics interfaces with the host docker daemon.
// Crucially, it swallows errors cleanly to prevent Probe panics on environments without docker.
func CollectDockerMetrics() (string, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return "", err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
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
			Id:    c.ID[:10],
			Name:  name,
			State: c.State,
		})
	}

	bytes, err := json.Marshal(results)
	if err != nil {
		return "", err
	}

	return string(bytes), nil
}
