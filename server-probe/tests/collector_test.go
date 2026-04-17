package tests

import (
	"testing"

	"uptime-lofi-probe/internal/collector"
)

func TestCollectCPU(t *testing.T) {
	cpuPct, _, err := collector.CollectSystemMetrics()
	if err != nil {
		t.Fatalf("CollectSystemMetrics failed: %v", err)
	}
	if cpuPct < 0 || cpuPct > 100 {
		t.Fatalf("CPU percentage out of range: %f", cpuPct)
	}
}

func TestCollectMemory(t *testing.T) {
	_, memPct, err := collector.CollectSystemMetrics()
	if err != nil {
		t.Fatalf("CollectSystemMetrics failed: %v", err)
	}
	if memPct <= 0 {
		t.Fatalf("memory percentage should be positive: %f", memPct)
	}
	if memPct > 100 {
		t.Fatalf("memory percentage should not exceed 100: %f", memPct)
	}
}

func TestCollectMultiple(t *testing.T) {
	for i := 0; i < 3; i++ {
		cpuPct, memPct, err := collector.CollectSystemMetrics()
		if err != nil {
			t.Fatalf("CollectSystemMetrics failed on run %d: %v", i, err)
		}
		if cpuPct < 0 || cpuPct > 100 {
			t.Fatalf("CPU percentage out of range on run %d: %f", i, cpuPct)
		}
		if memPct < 0 || memPct > 100 {
			t.Fatalf("memory percentage out of range on run %d: %f", i, memPct)
		}
	}
}

func TestCollectPing(t *testing.T) {
	latency := collector.PingTarget("http://127.0.0.1:1")
	if latency < 0 {
		t.Fatalf("expected non-negative latency, got %d", latency)
	}
}
