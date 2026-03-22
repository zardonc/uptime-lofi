package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"
	"uptime-lofi-probe/internal/config"
)

var cfgFile string
var enableDocker bool

var rootCmd = &cobra.Command{
	Use:   "probe",
	Short: "Uptime LoFi Probe",
	Long:  "A lightweight telemetry probe for pushing system metrics and Docker status to Cloudflare.",
	Run: func(cmd *cobra.Command, args []string) {
		cfg, err := config.LoadConfig(cfgFile)
		if err != nil {
			log.Fatalf("Configuration Error: %v", err)
		}

		// CLI flag overrides YAML config if explicitly set
		if cmd.Flags().Changed("enable-docker") {
			cfg.EnableDocker = enableDocker
		}

		log.Printf("Starting Uptime LoFi Probe [%s]...", cfg.NodeID)
		log.Printf("Target Edge: %s | Docker Analytics: %v", cfg.ApiUrl, cfg.EnableDocker)

		// Create a channel to wait for OS signals (SIGINT, SIGTERM)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

		// Application keeps running until signal is caught
		<-sigChan
		log.Println("Interrupt signal received. Shutting down gracefully...")
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is ./config.yaml)")
	rootCmd.PersistentFlags().BoolVar(&enableDocker, "enable-docker", false, "Enable Docker container tracking")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
