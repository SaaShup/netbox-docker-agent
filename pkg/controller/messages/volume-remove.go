package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/client"
)

type VolumeRemoveRequest struct {
	Context context.Context
	ReplyTo chan VolumeRemoveResponse
	Name    string
}

type VolumeRemoveResponse struct {
	Err error
}

func (m *VolumeRemoveRequest) Handle(client *client.Client) error {
	slog.InfoContext(
		m.Context,
		"Removing volume",
		"volume.name", m.Name,
	)

	err := client.VolumeRemove(
		m.Context,
		m.Name,
		true,
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"volume.name", m.Name,
		)
	}

	m.ReplyTo <- VolumeRemoveResponse{
		Err: err,
	}

	return nil
}
