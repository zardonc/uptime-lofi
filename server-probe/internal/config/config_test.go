package config

import (
	"os"
	"testing"
)

func TestLoadConfigMissingFile(t *testing.T) {
	// Without env vars or a valid config file, LoadConfig should fail on validation
	os.Clearenv()
	_, err := LoadConfig("non_existent_config.yaml")
	if err == nil {
		t.Errorf("Expected error due to missing required fields, got nil")
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	os.Clearenv()
	os.Setenv("UPTIME_API_URL", "https://api.example.com")
	os.Setenv("UPTIME_NODE_ID", "test-node")
	os.Setenv("UPTIME_PSK", "secret")
	os.Setenv("UPTIME_ENABLE_DOCKER", "true")

	cfg, err := LoadConfig("")
	if err != nil {
		t.Fatalf("Failed to load config from env: %v", err)
	}

	if cfg.ApiUrl != "https://api.example.com" {
		t.Errorf("Expected api_url 'https://api.example.com', got '%s'", cfg.ApiUrl)
	}
	if cfg.NodeID != "test-node" {
		t.Errorf("Expected node_id 'test-node', got '%s'", cfg.NodeID)
	}
	if cfg.PSK != "secret" {
		t.Errorf("Expected psk 'secret', got '%s'", cfg.PSK)
	}
	if !cfg.EnableDocker {
		t.Errorf("Expected enable_docker to be true, got false")
	}
}
