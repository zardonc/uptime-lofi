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

func TestHMACDeterministic(t *testing.T) {
	psk := "my-secret-key"
	timestamp := int64(1710000000)
	body := []byte(`[{"node_id":"test","cpu":10.5}]`)

	first := pusher.GenerateSignature(psk, timestamp, body)
	second := pusher.GenerateSignature(psk, timestamp, body)

	if first != second {
		t.Fatalf("expected deterministic signatures, got %q and %q", first, second)
	}
}

func TestHMACDifferentKeys(t *testing.T) {
	timestamp := int64(1710000000)
	body := []byte(`[{"node_id":"test","cpu":10.5}]`)

	first := pusher.GenerateSignature("key-one", timestamp, body)
	second := pusher.GenerateSignature("key-two", timestamp, body)

	if first == second {
		t.Fatalf("expected different keys to produce different signatures")
	}
}

func TestHMACDifferentMessages(t *testing.T) {
	psk := "shared-key"
	timestamp := int64(1710000000)

	first := pusher.GenerateSignature(psk, timestamp, []byte(`[{"node_id":"a"}]`))
	second := pusher.GenerateSignature(psk, timestamp, []byte(`[{"node_id":"b"}]`))

	if first == second {
		t.Fatalf("expected different messages to produce different signatures")
	}
}

func TestHMACEmptyMessage(t *testing.T) {
	sig := pusher.GenerateSignature("shared-key", 1710000000, []byte{})
	if len(sig) != 64 {
		t.Fatalf("expected hex encoded sha256 signature, got %q", sig)
	}
}
