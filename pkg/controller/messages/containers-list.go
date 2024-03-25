package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

type ContainersListRequest struct {
	Context context.Context
	ReplyTo chan ContainersListResponse
}

type ContainersListResponse struct {
	Containers []types.Container
	Err        error
}

func (m *ContainersListRequest) Handle(client *client.Client) error {
	slog.DebugContext(
		m.Context,
		"Listing containers",
	)

	containers, err := client.ContainerList(
		m.Context,
		container.ListOptions{
			All: true,
		},
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
		)
	}

	m.ReplyTo <- ContainersListResponse{
		Containers: containers,
		Err:        err,
	}

	return nil
}
