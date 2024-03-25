package types

import (
	"context"

	"github.com/docker/docker/api/types/registry"
	"github.com/docker/docker/client"
)

type RegistryAuth struct {
	Username      string `json:"username"`
	Password      string `json:"password"`
	ServerAddress string `json:"address"`
}

func (r RegistryAuth) GetIdentityToken(
	client *client.Client,
	ctx context.Context,
) (string, error) {
	res, err := client.RegistryLogin(
		ctx,
		registry.AuthConfig{
			Username:      r.Username,
			Password:      r.Password,
			ServerAddress: r.ServerAddress,
		},
	)

	if err != nil {
		return "", err
	}

	return res.IdentityToken, nil
}
