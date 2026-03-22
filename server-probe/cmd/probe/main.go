package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"uptime-lofi-probe/internal/collector"
	"uptime-lofi-probe/internal/config"
	"uptime-lofi-probe/internal/pusher"
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

		batchPusher := pusher.NewBatchPusher(cfg)

		log.Printf("Starting Uptime LoFi Probe [%s]...", cfg.NodeID)
		log.Printf("Target Edge: %s | Docker Analytics: %v", cfg.ApiUrl, cfg.EnableDocker)

		// Create background measurement tickers
		collectTicker := time.NewTicker(1 * time.Minute)
		pushTicker := time.NewTicker(5 * time.Minute)
		defer collectTicker.Stop()
		defer pushTicker.Stop()

		// Core Telemetry Dispatch Routine
		go func() {
			for {
				select {
				case <-collectTicker.C:
					cpuPct, memPct, err := collector.CollectSystemMetrics()
					if err != nil {
						log.Printf("[Hardware Warn] Metric collection failed: %v", err)
					}
					ping := collector.PingTarget(cfg.ApiUrl)

					payload := collector.MetricPayload{
						NodeID:    cfg.NodeID,
						Timestamp: time.Now().Unix(),
						PingMs:    ping,
						CpuUsage:  cpuPct,
						MemUsage:  memPct,
						IsUp:      true,
					}

					// Safely attempt IPC integration with Docker Engine
					if cfg.EnableDocker {
						containers, dErr := collector.CollectDockerMetrics()
						if dErr == nil && len(containers) > 0 {
							payload.ContainersJson = containers
						}
					}
					
					batchPusher.AddMetric(payload)
					log.Printf("Snapshot OK -> CPU: %.1f%% | MEM: %.1f%% | PING: %dms", cpuPct, memPct, ping)

				case <-pushTicker.C:
					go batchPusher.FlushToEdge()
				}
			}
		}()

		// Create a channel to wait for OS signals (SIGINT, SIGTERM)
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

		<-sigChan
		log.Println("Interrupt signal received. Hand-off final metrics and shutting down gracefully...")
		batchPusher.FlushToEdge()
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
