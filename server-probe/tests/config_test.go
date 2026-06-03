package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"uptime-lofi-probe/internal/config"
)

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{"UPTIME_API_URL", "UPTIME_MONITOR_ID", "UPTIME_PSK", "UPTIME_ENABLE_DOCKER"} {
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("failed to unset %s: %v", key, err)
		}
	}
}

func TestLoadConfigMissingFile(t *testing.T) {
	clearConfigEnv(t)
	_, err := config.LoadConfig("non_existent_config.yaml")
	if err == nil {
		t.Errorf("Expected error due to missing required fields, got nil")
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	clearConfigEnv(t)
	os.Setenv("UPTIME_API_URL", "https://api.example.com")
	os.Setenv("UPTIME_MONITOR_ID", "test-monitor")
	os.Setenv("UPTIME_PSK", "secret")
	os.Setenv("UPTIME_ENABLE_DOCKER", "true")

	cfg, err := config.LoadConfig("")
	if err != nil {
		t.Fatalf("Failed to load config from env: %v", err)
	}

	if cfg.ApiUrl != "https://api.example.com" {
		t.Errorf("Expected api_url 'https://api.example.com', got '%s'", cfg.ApiUrl)
	}
	if cfg.MonitorID != "test-monitor" {
		t.Errorf("Expected monitor_id 'test-monitor', got '%s'", cfg.MonitorID)
	}
	if cfg.PSK != "secret" {
		t.Errorf("Expected psk 'secret', got '%s'", cfg.PSK)
	}
	if !cfg.EnableDocker {
		t.Errorf("Expected enable_docker to be true, got false")
	}
}

func TestConfigDefaults(t *testing.T) {
	clearConfigEnv(t)
	os.Setenv("UPTIME_PSK", "secret")

	cfg, err := config.LoadConfig("")
	if err != nil {
		t.Fatalf("Failed to load config defaults: %v", err)
	}

	if cfg.ApiUrl == "" {
		t.Fatalf("expected default api_url")
	}
	if cfg.MonitorID == "" {
		t.Fatalf("expected default monitor_id")
	}
	if cfg.EnableDocker {
		t.Fatalf("expected default enable_docker false")
	}
}

func TestConfigEnvOverride(t *testing.T) {
	clearConfigEnv(t)
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "config.yaml")
	content := strings.Join([]string{
		"api_url: https://yaml.example.com/push",
		"monitor_id: yaml-monitor",
		"psk: yaml-secret",
		"enable_docker: false",
	}, "\n")
	if err := os.WriteFile(cfgPath, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	os.Setenv("UPTIME_API_URL", "https://env.example.com/push")
	os.Setenv("UPTIME_MONITOR_ID", "env-monitor")
	os.Setenv("UPTIME_PSK", "env-secret")
	os.Setenv("UPTIME_ENABLE_DOCKER", "true")

	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		t.Fatalf("Failed to load config with env overrides: %v", err)
	}

	if cfg.ApiUrl != "https://env.example.com/push" || cfg.MonitorID != "env-monitor" || cfg.PSK != "env-secret" || !cfg.EnableDocker {
		t.Fatalf("expected env overrides to win, got %+v", cfg)
	}
}

func TestConfigYAMLParsing(t *testing.T) {
	clearConfigEnv(t)
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "config.yaml")
	content := strings.Join([]string{
		"api_url: https://yaml.example.com/push",
		"monitor_id: yaml-monitor",
		"psk: yaml-secret",
		"enable_docker: true",
	}, "\n")
	if err := os.WriteFile(cfgPath, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		t.Fatalf("Failed to load YAML config: %v", err)
	}

	if cfg.ApiUrl != "https://yaml.example.com/push" {
		t.Fatalf("unexpected api_url: %s", cfg.ApiUrl)
	}
	if cfg.MonitorID != "yaml-monitor" {
		t.Fatalf("unexpected monitor_id: %s", cfg.MonitorID)
	}
	if cfg.PSK != "yaml-secret" {
		t.Fatalf("unexpected psk: %s", cfg.PSK)
	}
	if !cfg.EnableDocker {
		t.Fatalf("expected enable_docker true")
	}
}

func TestConfigValidation(t *testing.T) {
	clearConfigEnv(t)
	tmpDir := t.TempDir()
	cfgPath := filepath.Join(tmpDir, "config.yaml")
	content := strings.Join([]string{
		"api_url: ''",
		"monitor_id: ''",
		"psk: ''",
	}, "\n")
	if err := os.WriteFile(cfgPath, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write temp config: %v", err)
	}

	_, err := config.LoadConfig(cfgPath)
	if err == nil {
		t.Fatalf("expected validation error for empty required fields")
	}
}
