package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/docker/docker/api/types"
)

var (
	containerRunning = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "netbox_docker_agent_container_running",
			Help: "Show if a container is running",
		},
		[]string{"name"},
	)
	containerStopped = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "netbox_docker_agent_container_stopped",
			Help: "Show if a container is stopped",
		},
		[]string{"name"},
	)
	containerExited = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "netbox_docker_agent_container_exited",
			Help: "Show if a container has exited",
		},
		[]string{"name"},
	)
)

func updateContainerMetrics(containers []types.Container) {
	for _, container := range containers {
		labels := prometheus.Labels{"name": container.Names[0]}

		switch container.State {
		case "running":
			containerRunning.With(labels).Set(1)
			containerStopped.With(labels).Set(0)
			containerExited.With(labels).Set(0)

		case "stopped":
			containerRunning.With(labels).Set(0)
			containerStopped.With(labels).Set(1)
			containerExited.With(labels).Set(0)

		case "exited":
			containerRunning.With(labels).Set(0)
			containerStopped.With(labels).Set(0)
			containerExited.With(labels).Set(1)
		}
	}
}
