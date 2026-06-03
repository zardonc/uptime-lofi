package tests

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"uptime-lofi-probe/internal/collector"
	"uptime-lofi-probe/internal/config"
	"uptime-lofi-probe/internal/pusher"
)

func TestV2PushUsesMonitorPayloadShape(t *testing.T) {
	var receivedBody []byte
	var receivedMonitorID string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMonitorID = r.Header.Get("X-Monitor-Id")
		defer r.Body.Close()
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	batch := pusher.NewBatchPusher(&config.Config{
		ApiUrl: server.URL + "/api/push",
		MonitorID: "monitor-v2-compatible",
		PSK:    "test-psk",
	})
	batch.AddMetric(collector.MetricPayload{
		MonitorID:      "monitor-v2-compatible",
		Timestamp:      1710000000,
		PingMs:         25,
		CpuUsage:       12.5,
		MemUsage:       45.5,
		IsUp:           true,
		ContainersJson: `[{"name":"app"}]`,
	})
	batch.FlushToEdge()

	if receivedMonitorID != "monitor-v2-compatible" {
		t.Fatalf("expected X-Monitor-Id auth header, got %q", receivedMonitorID)
	}

	var payload []map[string]any
	if err := json.Unmarshal(receivedBody, &payload); err != nil {
		t.Fatalf("expected JSON probe payload: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected one payload entry, got %d", len(payload))
	}

	entry := payload[0]
	for _, key := range []string{"monitor_id", "timestamp", "ping", "cpu", "mem", "is_up", "containers_json"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("expected existing payload key %q in %#v", key, entry)
		}
	}
	for _, forbidden := range []string{"api_secret", "master_secret"} {
		if _, ok := entry[forbidden]; ok {
			t.Fatalf("probe payload must not include %q", forbidden)
		}
	}
}
