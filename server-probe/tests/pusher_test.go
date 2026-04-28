package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/cenkalti/backoff/v4"
	"uptime-lofi-probe/internal/collector"
	"uptime-lofi-probe/internal/config"
	"uptime-lofi-probe/internal/pusher"
)

func testMetric() collector.MetricPayload {
	return collector.MetricPayload{
		NodeID:    "node-1",
		Timestamp: 1710000000,
		PingMs:    12,
		CpuUsage:  33.3,
		MemUsage:  44.4,
		IsUp:      true,
	}
}

func TestPusherFlushSuccess(t *testing.T) {
	var requestCount int
	var receivedAuth string
	var receivedTimestamp string
	var receivedNodeID string
	var receivedBody []byte

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		receivedAuth = r.Header.Get("Authorization")
		receivedTimestamp = r.Header.Get("X-Timestamp")
		receivedNodeID = r.Header.Get("X-Node-Id")
		defer r.Body.Close()
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := pusher.NewBatchPusher(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: "test-psk"})
	p.AddMetric(testMetric())
	p.FlushToEdge()

	if requestCount != 1 {
		t.Fatalf("expected 1 request, got %d", requestCount)
	}
	if receivedAuth == "" {
		t.Fatalf("expected Authorization header")
	}
	if receivedAuth[:7] != "Bearer " {
		t.Fatalf("expected bearer auth header, got %q", receivedAuth)
	}
	if receivedTimestamp == "" {
		t.Fatalf("expected X-Timestamp header")
	}
	if receivedNodeID != "node-1" {
		t.Fatalf("expected X-Node-Id node-1, got %q", receivedNodeID)
	}

	var payload []collector.MetricPayload
	if err := json.Unmarshal(receivedBody, &payload); err != nil {
		t.Fatalf("expected valid JSON body: %v", err)
	}
	if len(payload) != 1 || payload[0].NodeID != "node-1" {
		t.Fatalf("unexpected payload: %+v", payload)
	}

	ts, err := strconv.ParseInt(receivedTimestamp, 10, 64)
	if err != nil {
		t.Fatalf("timestamp should parse: %v", err)
	}
	expectedSig := pusher.GenerateSignature("test-psk", ts, receivedBody)
	if receivedAuth != "Bearer "+expectedSig {
		t.Fatalf("unexpected auth signature")
	}
}

func TestPusherFlushRetry(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := pusher.NewBatchPusher(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: "test-psk"})
	p.AddMetric(testMetric())
	p.FlushToEdge()

	if requestCount < 2 {
		t.Fatalf("expected retry, got %d requests", requestCount)
	}
}

func TestPusherBackoff(t *testing.T) {
	requestTimes := make([]time.Time, 0, 3)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestTimes = append(requestTimes, time.Now())
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	backoffs := []time.Duration{10 * time.Millisecond, 20 * time.Millisecond, backoff.Stop}
	p := pusher.NewBatchPusherWithDeps(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: "test-psk"}, nil, func() backoff.BackOff {
		return &backoff.ConstantBackOff{Interval: backoffs[0]}
	})
	p.AddMetric(testMetric())
	// override helper to produce deterministic increasing intervals
	p = pusher.NewBatchPusherWithDeps(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: "test-psk"}, nil, func() backoff.BackOff {
		return backoff.WithMaxRetries(backoff.NewExponentialBackOff(backoff.WithInitialInterval(10*time.Millisecond), backoff.WithMaxInterval(20*time.Millisecond), backoff.WithMaxElapsedTime(60*time.Millisecond)), 2)
	})
	p.AddMetric(testMetric())
	p.FlushToEdge()
	if len(requestTimes) < 2 {
		t.Fatalf("expected multiple attempts, got %d", len(requestTimes))
	}
	firstGap := requestTimes[1].Sub(requestTimes[0])
	if firstGap <= 0 {
		t.Fatalf("expected positive backoff delay")
	}
	if len(requestTimes) >= 3 {
		secondGap := requestTimes[2].Sub(requestTimes[1])
		if secondGap < firstGap {
			t.Fatalf("expected non-decreasing backoff intervals, got %s then %s", firstGap, secondGap)
		}
	}
}

func TestPusherBatchAccumulation(t *testing.T) {
	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := pusher.NewBatchPusher(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: "test-psk"})
	for range 59 {
		p.AddMetric(testMetric())
	}

	if requestCount != 0 {
		t.Fatalf("expected no automatic flush before threshold, got %d", requestCount)
	}

	p.AddMetric(testMetric())
	if requestCount == 0 {
		t.Fatalf("expected automatic flush after threshold")
	}
}

func TestPusherHMACHeaders(t *testing.T) {
	var receivedAuth string
	var receivedTimestamp string
	var receivedBody []byte
	psk := "test-psk"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		receivedTimestamp = r.Header.Get("X-Timestamp")
		defer r.Body.Close()
		receivedBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := pusher.NewBatchPusher(&config.Config{ApiUrl: server.URL, NodeID: "node-1", PSK: psk})
	p.AddMetric(testMetric())
	p.FlushToEdge()

	if receivedTimestamp == "" {
		t.Fatalf("expected timestamp")
	}
	if receivedAuth == "" {
		t.Fatalf("expected HMAC header")
	}
	ts, err := strconv.ParseInt(receivedTimestamp, 10, 64)
	if err != nil {
		t.Fatalf("expected parseable timestamp: %v", err)
	}
	expected := pusher.GenerateSignature(psk, ts, bytes.Clone(receivedBody))
	if receivedAuth != "Bearer "+expected {
		t.Fatalf("expected valid HMAC signature")
	}
}
