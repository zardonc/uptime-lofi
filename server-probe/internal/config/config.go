package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

const (
	defaultAPIURL       = "http://localhost:8787/api/push"
	defaultNodeID       = "probe-local"
	defaultEnableDocker = false
)

func newViper() *viper.Viper {
	v := viper.New()
	v.SetDefault("api_url", defaultAPIURL)
	v.SetDefault("node_id", defaultNodeID)
	v.SetDefault("enable_docker", defaultEnableDocker)
	v.SetEnvPrefix("UPTIME")
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.BindEnv("api_url")
	v.BindEnv("node_id")
	v.BindEnv("psk")
	v.BindEnv("enable_docker")
	return v
}

type Config struct {
	ApiUrl       string `mapstructure:"api_url"`
	NodeID       string `mapstructure:"node_id"`
	PSK          string `mapstructure:"psk"`
	EnableDocker bool   `mapstructure:"enable_docker"`
}

func LoadConfig(cfgFile string) (*Config, error) {
	v := newViper()

	if cfgFile != "" {
		v.SetConfigFile(cfgFile)
	} else {
		// defaults to looking for config.yaml in current dir
		v.AddConfigPath(".")
		v.SetConfigName("config")
		v.SetConfigType("yaml")
	}

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
		// It's acceptable if the file doesn't exist, as long as ENVs or defaults satisfy requirements
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Basic validation
	if cfg.ApiUrl == "" {
		return nil, fmt.Errorf("api_url is required")
	}
	if cfg.NodeID == "" {
		return nil, fmt.Errorf("node_id is required")
	}
	if cfg.PSK == "" {
		return nil, fmt.Errorf("psk is required")
	}

	return &cfg, nil
}
