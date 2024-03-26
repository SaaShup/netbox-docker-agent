package mocks

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

type DockerTestClient struct {
	client.APIClient

	ImagePullBehavior ImagePullBehaviorTestData
	ImageListBehavior ImageListBehaviorTestData
}

type ImagePullBehaviorTestData struct {
	Succeeds     bool
	ErrorMessage string
}

type ImageListBehaviorTestData struct {
	Succeeds     bool
	ErrorMessage string
	ReturnValue  []image.Summary
}

func (c *DockerTestClient) ImagePull(ctx context.Context, ref string, options image.PullOptions) (io.ReadCloser, error) {
	if c.ImagePullBehavior.Succeeds {
		reader := strings.NewReader("test")
		return io.NopCloser(reader), nil
	} else {
		return nil, fmt.Errorf(c.ImagePullBehavior.ErrorMessage)
	}
}

func (c *DockerTestClient) ImageList(ctx context.Context, options image.ListOptions) ([]image.Summary, error) {
	if c.ImageListBehavior.Succeeds {
		return c.ImageListBehavior.ReturnValue, nil
	} else {
		return nil, fmt.Errorf(c.ImageListBehavior.ErrorMessage)
	}
}
