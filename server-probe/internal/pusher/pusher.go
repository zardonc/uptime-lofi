package pusher

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/cenkalti/backoff/v4"
	"uptime-lofi-probe/internal/collector"
	"uptime-lofi-probe/internal/config"
)

// BatchPusher aggregates telemetry readings and dispatches them via secure REST endpoints.
type BatchPusher struct {
	cfg    *config.Config
	buffer []collector.MetricPayload
	mutex  sync.Mutex
}

// NewBatchPusher initiates the rolling transport module.
func NewBatchPusher(cfg *config.Config) *BatchPusher {
	return &BatchPusher{
		cfg:    cfg,
		buffer: make([]collector.MetricPayload, 0, 60), // Room for up to 60 telemetry points
	}
}

// AddMetric appends a reading. It's safe for concurrent background execution.
func (p *BatchPusher) AddMetric(m collector.MetricPayload) {
	p.mutex.Lock()
	defer p.mutex.Unlock()
	p.buffer = append(p.buffer, m)
}

// FlushToEdge converts unpushed metrics into a JSON batch and forces an HMAC signature push via Jitter Backoff.
func (p *BatchPusher) FlushToEdge() {
	p.mutex.Lock()
	if len(p.buffer) == 0 {
		p.mutex.Unlock()
		return
	}
	
	// Create isolated transmission slice to unblock collector routine rapidly
	snapshots := make([]collector.MetricPayload, len(p.buffer))
	copy(snapshots, p.buffer)
	p.mutex.Unlock()

	payloadBytes, err := json.Marshal(snapshots)
	if err != nil {
		log.Printf("[Pusher] Failed to marshal batch metrics: %v", err)
		return
	}

	b := backoff.NewExponentialBackOff()
	b.MaxElapsedTime = 2 * time.Minute // Prevent infinite loop drops

	operation := func() error {
		timestamp := time.Now().Unix()
		signature := GenerateSignature(p.cfg.PSK, timestamp, payloadBytes)

		req, err := http.NewRequest("POST", p.cfg.ApiUrl, bytes.NewBuffer(payloadBytes))
		if err != nil {
			return backoff.Permanent(err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Timestamp", fmt.Sprintf("%d", timestamp))
		req.Header.Set("Authorization", "Bearer "+signature)

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		
		if err != nil {
			log.Printf("[Pusher - Network Err] Retrying... %v", err)
			return err 
		}
		defer resp.Body.Close()

		switch {
		case resp.StatusCode == 410:
			// Hard edge-case: If Gateway responds with 410 Gone, node is permanently disconnected
			log.Fatalf("[FATAL] 410 Gone returned. Node identity suspended by Control Plane. Exiting.")
			return backoff.Permanent(fmt.Errorf("410 remote suspension"))
		case resp.StatusCode >= 200 && resp.StatusCode < 300:
			log.Printf("[Pusher] Success! Flushed %d metrics to Edge (Status: %d)", len(snapshots), resp.StatusCode)
			return nil 
		case resp.StatusCode >= 500 || resp.StatusCode == 429:
			log.Printf("[Pusher] Server saturated (Status %d), initiating exponential backoff...", resp.StatusCode)
			return fmt.Errorf("server busy: %d", resp.StatusCode)
		default:
			log.Printf("[Pusher] Rejected payload (Status %d, PSK invalid?), dropping batch.", resp.StatusCode)
			return backoff.Permanent(fmt.Errorf("rejected payload: %d", resp.StatusCode))
		}
	}

	if err := backoff.Retry(operation, b); err != nil {
		log.Printf("[Pusher] Dropped telemetry batch after returning max retries: %v", err)
	} else {
		p.mutex.Lock()
		// Only chop off the data we just submitted (in case collector was fast enough to push while flushing)
		p.buffer = p.buffer[len(snapshots):] 
		p.mutex.Unlock()
	}
}
