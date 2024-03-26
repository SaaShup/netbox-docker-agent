package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerStopRequest struct {
	Context     context.Context
	ReplyTo     chan ContainerStopResponse
	ContainerID string
}

type ContainerStopResponse struct {
	Err error
}

func (m *ContainerStopRequest) Handle(client client.APIClient) error {
	slog.InfoContext(
		m.Context,
		"Stopping container",
		"container.id", m.ContainerID,
	)

	err := client.ContainerStop(
		m.Context,
		m.ContainerID,
		container.StopOptions{},
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"container.id", m.ContainerID,
		)
	}

	m.ReplyTo <- ContainerStopResponse{Err: err}
	return nil
}
