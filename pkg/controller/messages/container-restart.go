package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerRestartRequest struct {
	Context     context.Context
	ReplyTo     chan ContainerRestartResponse
	ContainerID string
}

type ContainerRestartResponse struct {
	Err error
}

func (m *ContainerRestartRequest) Handle(client *client.Client) error {
	slog.InfoContext(
		m.Context,
		"Restarting container",
		"container.id", m.ContainerID,
	)

	err := client.ContainerRestart(
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

	m.ReplyTo <- ContainerRestartResponse{Err: err}
	return nil
}
