package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
)

type VolumeCreateRequest struct {
	Context context.Context
	ReplyTo chan VolumeCreateResponse
	Driver  string
	Name    string
}

type VolumeCreateResponse struct {
	Mountpoint string
	Err        error
}

func (m *VolumeCreateRequest) Handle(client *client.Client) error {
	slog.InfoContext(
		m.Context,
		"Creating volume",
		"volume.name", m.Name,
		"volume.driver", m.Driver,
	)

	volume, err := client.VolumeCreate(
		m.Context,
		volume.CreateOptions{
			Driver: m.Driver,
			Name:   m.Name,
		},
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"volume.name", m.Name,
			"volume.driver", m.Driver,
		)
	}

	m.ReplyTo <- VolumeCreateResponse{
		Mountpoint: volume.Mountpoint,
		Err:        err,
	}

	return nil
}
