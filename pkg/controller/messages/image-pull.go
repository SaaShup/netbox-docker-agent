package messages

import (
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"

	"github.com/saashup/docker-netbox-controller/internal/types"
)

type ImagePullRequest struct {
	Context      context.Context
	ReplyTo      chan ImagePullResponse
	RegistryAuth *types.RegistryAuth
	FQName       string
}

type ImagePullResponse struct {
	Digest string
	Err    error
}

func (m *ImagePullRequest) Handle(client client.APIClient) error {
	token := ""
	if m.RegistryAuth != nil {
		slog.InfoContext(
			m.Context,
			"Get registry identity token",
			"image.name", m.FQName,
			"image.registry", m.RegistryAuth.ServerAddress,
		)

		identity, err := m.RegistryAuth.GetIdentityToken(client, m.Context)
		if err != nil {
			slog.ErrorContext(
				m.Context,
				err.Error(),
				"image.name", m.FQName,
				"image.registry", m.RegistryAuth.ServerAddress,
			)

			m.ReplyTo <- ImagePullResponse{
				Digest: "",
				Err:    err,
			}
			return nil
		}
		token = identity
	}

	slog.InfoContext(
		m.Context,
		"Pulling image",
		"image.name", m.FQName,
	)

	reader, err := client.ImagePull(
		m.Context,
		m.FQName,
		image.PullOptions{RegistryAuth: token},
	)
	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"image.name", m.FQName,
		)

		m.ReplyTo <- ImagePullResponse{
			Digest: "",
			Err:    err,
		}
		return nil
	}

	io.Copy(io.Discard, reader)
	reader.Close()

	images, err := client.ImageList(
		m.Context,
		image.ListOptions{
			All: true,
		},
	)
	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"image.name", m.FQName,
		)

		m.ReplyTo <- ImagePullResponse{
			Digest: "",
			Err:    err,
		}
		return nil
	}

	for _, img := range images {
		for _, tag := range img.RepoTags {
			if tag == m.FQName {
				slog.InfoContext(
					m.Context,
					"Image pulled",
					"image.name", m.FQName,
					"image.digest", img.ID,
				)

				m.ReplyTo <- ImagePullResponse{
					Digest: img.ID,
					Err:    nil,
				}
				return nil
			}
		}
	}

	err = fmt.Errorf("image pulled but was not found")
	slog.ErrorContext(
		m.Context,
		err.Error(),
		"image.name", m.FQName,
	)

	m.ReplyTo <- ImagePullResponse{
		Digest: "",
		Err:    err,
	}

	return nil
}
