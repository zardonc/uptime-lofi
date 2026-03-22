package collector

import (
	"context"
	"net/http"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
)

type MetricPayload struct {
	NodeID         string  `json:"node_id"`
	Timestamp      int64   `json:"timestamp"`
	PingMs         int     `json:"ping,omitempty"`
	CpuUsage       float64 `json:"cpu"`
	MemUsage       float64 `json:"mem"`
	IsUp           bool    `json:"is_up"`
	ContainersJson string  `json:"containers_json,omitempty"`
}

// PingTarget measures standard latency without raw ICMP sockets (bypasses OS restrictions)
func PingTarget(targetUrl string) int {
	start := time.Now()

	client := http.Client{
		Timeout: 2 * time.Second,
	}

	req, err := http.NewRequestWithContext(context.Background(), "HEAD", targetUrl, nil)
	if err != nil {
		return 2000 // Fake max timeout ms on malformed errors
	}

	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()

	if err != nil || resp.StatusCode >= 500 {
		return int(elapsed) 
	}
	defer resp.Body.Close()

	return int(elapsed)
}

// CollectSystemMetrics reads host OS load averages and virt memory
func CollectSystemMetrics() (float64, float64, error) {
	// Sample CPU across all cores for 500ms
	cpuPercents, err := cpu.Percent(500*time.Millisecond, false)
	if err != nil || len(cpuPercents) == 0 {
		return 0, 0, err
	}

	vmem, err := mem.VirtualMemory()
	if err != nil {
		return cpuPercents[0], 0, err
	}

	return cpuPercents[0], vmem.UsedPercent, nil
}
