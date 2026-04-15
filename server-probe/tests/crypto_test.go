package tests

import (
	"testing"
	"uptime-lofi-probe/internal/pusher"
)

func TestGenerateSignature(t *testing.T) {
	psk := "my-secret-key"
	timestamp := int64(1710000000)
	rawBody := []byte(`[{"node_id":"test","cpu":10.5}]`)

	sig := pusher.GenerateSignature(psk, timestamp, rawBody)
	if len(sig) != 64 {
		t.Errorf("Signature should be 64 characters long, got %d", len(sig))
	}
}
