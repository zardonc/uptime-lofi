package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	ApiUrl       string `mapstructure:"api_url"`
	NodeID       string `mapstructure:"node_id"`
	PSK          string `mapstructure:"psk"`
	EnableDocker bool   `mapstructure:"enable_docker"`
}

func LoadConfig(cfgFile string) (*Config, error) {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		// defaults to looking for config.yaml in current dir
		viper.AddConfigPath(".")
		viper.SetConfigName("config")
		viper.SetConfigType("yaml")
	}

	viper.SetEnvPrefix("UPTIME")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	viper.BindEnv("api_url")
	viper.BindEnv("node_id")
	viper.BindEnv("psk")
	viper.BindEnv("enable_docker")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
		// It's acceptable if the file doesn't exist, as long as ENVs or defaults satisfy requirements
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
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
