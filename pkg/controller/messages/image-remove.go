package messages

import (
	"context"
	"log/slog"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

type ImageRemoveRequest struct {
	Context context.Context
	ReplyTo chan ImageRemoveResponse
	Digest  string
}

type ImageRemoveResponse struct {
	Err error
}

func (m *ImageRemoveRequest) Handle(client *client.Client) error {
	slog.InfoContext(
		m.Context,
		"Removing image",
		"image.digest", m.Digest,
	)

	_, err := client.ImageRemove(
		m.Context,
		m.Digest,
		image.RemoveOptions{},
	)
	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"image.digest", m.Digest,
		)

		m.ReplyTo <- ImageRemoveResponse{
			Err: err,
		}
		return nil
	}

	m.ReplyTo <- ImageRemoveResponse{
		Err: nil,
	}

	return nil
}
