package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainerRemoveRequest struct {
	Context     context.Context
	ReplyTo     chan ContainerRemoveResponse
	ContainerID string
}

type ContainerRemoveResponse struct {
	Err error
}

func (m *ContainerRemoveRequest) Handle(client client.APIClient) error {
	slog.InfoContext(
		m.Context,
		"Removing container",
		"container.id", m.ContainerID,
	)

	err := client.ContainerRemove(
		m.Context,
		m.ContainerID,
		container.RemoveOptions{},
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"container.id", m.ContainerID,
		)
	}

	m.ReplyTo <- ContainerRemoveResponse{Err: err}
	return nil
}
