package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerStartRequest struct {
	Context     context.Context
	ReplyTo     chan ContainerStartResponse
	ContainerID string
}

type ContainerStartResponse struct {
	Err error
}

func (m *ContainerStartRequest) Handle(client *client.Client) error {
	slog.InfoContext(
		m.Context,
		"Starting container",
		"container.id", m.ContainerID,
	)

	err := client.ContainerStart(
		m.Context,
		m.ContainerID,
		container.StartOptions{},
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"container.id", m.ContainerID,
		)
	}

	m.ReplyTo <- ContainerStartResponse{Err: err}
	return nil
}
