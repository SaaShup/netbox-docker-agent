package messages

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"

	"github.com/saashup/docker-netbox-controller/internal/types"
)

type ContainerRecreateRequest struct {
	Context context.Context
	ReplyTo chan ContainerRecreateResponse
	Spec    types.ContainerSpec
}

type ContainerRecreateResponse struct {
	ContainerID string
	Err         error
}

func (m *ContainerRecreateRequest) Handle(client client.APIClient) error {
	if m.Spec.ContainerID != "" {
		slog.InfoContext(
			m.Context,
			"Removing existing container",
			"container.id", m.Spec.ContainerID,
		)

		err := client.ContainerRemove(
			m.Context,
			m.Spec.ContainerID,
			container.RemoveOptions{},
		)

		if err != nil {
			slog.ErrorContext(
				m.Context,
				err.Error(),
				"container.id", m.Spec.ContainerID,
			)

			m.ReplyTo <- ContainerRecreateResponse{
				ContainerID: m.Spec.ContainerID,
				Err:         err,
			}

			return nil
		}
	}

	portBindings := nat.PortMap{}
	for _, portSpec := range m.Spec.Ports {
		port, err := nat.NewPort(portSpec.Type, fmt.Sprint(portSpec.ContainerPort))
		if err != nil {
			slog.ErrorContext(
				m.Context,
				err.Error(),
				"container.name", m.Spec.Name,
				"container.image", m.Spec.Image,
				"container.port.type", portSpec.Type,
				"container.port.container_port", portSpec.ContainerPort,
			)

			m.ReplyTo <- ContainerRecreateResponse{
				ContainerID: "",
				Err:         err,
			}
			return nil
		}

		portBinding := nat.PortBinding{
			HostIP:   "0.0.0.0",
			HostPort: fmt.Sprint(portSpec.HostPort),
		}
		portBindings[port] = []nat.PortBinding{portBinding}
	}

	mounts := []mount.Mount{}
	for _, volumeSpec := range m.Spec.Volumes {
		mounts = append(mounts, mount.Mount{
			Type:   mount.TypeVolume,
			Source: volumeSpec.Name,
			Target: volumeSpec.ContainerPath,
		})
	}

	for _, bindSpec := range m.Spec.Binds {
		mounts = append(mounts, mount.Mount{
			Type:   mount.TypeBind,
			Source: bindSpec.HostPath,
			Target: bindSpec.ContainerPath,
		})
	}

	env := []string{}
	for key, value := range m.Spec.EnvVars {
		env = append(env, fmt.Sprintf("%s=%s", key, value))
	}

	slog.InfoContext(
		m.Context,
		"Creating container",
		"container.name", m.Spec.Name,
		"container.image", m.Spec.Image,
	)
	res, err := client.ContainerCreate(
		m.Context,
		&container.Config{
			Hostname: m.Spec.Hostname,
			Image:    m.Spec.Image,
			Env:      env,
			Labels:   m.Spec.Labels,
		},
		&container.HostConfig{
			PortBindings: portBindings,
			Mounts:       mounts,
		},
		nil,
		nil,
		m.Spec.Name,
	)

	if err != nil {
		slog.ErrorContext(
			m.Context,
			err.Error(),
			"container.name", m.Spec.Name,
			"container.image", m.Spec.Image,
		)

		m.ReplyTo <- ContainerRecreateResponse{
			ContainerID: "",
			Err:         err,
		}
		return nil
	}

	slog.InfoContext(
		m.Context,
		"Container created",
		"container.id", res.ID,
		"container.name", m.Spec.Name,
		"container.image", m.Spec.Image,
	)

	m.ReplyTo <- ContainerRecreateResponse{
		ContainerID: res.ID,
		Err:         nil,
	}

	return nil
}
