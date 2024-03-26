package controller_test

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/saashup/docker-netbox-controller/internal/logging"
	"github.com/saashup/docker-netbox-controller/pkg/controller/messages"
	"github.com/saashup/docker-netbox-controller/tests/mocks"
)

func init() {
	logger := slog.New(logging.NewHandler())
	slog.SetDefault(logger)
	logging.SetLevel(slog.LevelDebug)
}

func TestImagePullMessage(t *testing.T) {
	testCases := []struct {
		name    string
		message *messages.ImagePullRequest
		client  client.APIClient
		expects func(t *testing.T, resp messages.ImagePullResponse, err error)
	}{
		{
			name: "it should pull an image without a registry",
			message: &messages.ImagePullRequest{
				RegistryAuth: nil,
				FQName:       "alpine:latest",
			},
			client: &mocks.DockerTestClient{
				ImagePullBehavior: mocks.ImagePullBehaviorTestData{
					Succeeds: true,
				},
				ImageListBehavior: mocks.ImageListBehaviorTestData{
					Succeeds: true,
					ReturnValue: []image.Summary{
						{
							RepoTags: []string{"alpine:latest"},
							ID:       "sha256:1234567890abcdef",
						},
					},
				},
			},
			expects: func(t *testing.T, resp messages.ImagePullResponse, err error) {
				if err != nil {
					t.Errorf("Unexpected error from message handler: %v", err)
				}
				if resp.Err != nil {
					t.Errorf("Unexpected error in response: %v", resp.Err)
				}
				if resp.Digest != "sha256:1234567890abcdef" {
					t.Errorf("Unexpected digest in response: %s", resp.Digest)
				}
			},
		},
		{
			name: "it should fail if no image exists after pull",
			message: &messages.ImagePullRequest{
				RegistryAuth: nil,
				FQName:       "alpine:latest",
			},
			client: &mocks.DockerTestClient{
				ImagePullBehavior: mocks.ImagePullBehaviorTestData{
					Succeeds: true,
				},
				ImageListBehavior: mocks.ImageListBehaviorTestData{
					Succeeds:    true,
					ReturnValue: []image.Summary{},
				},
			},
			expects: func(t *testing.T, resp messages.ImagePullResponse, err error) {
				if err != nil {
					t.Errorf("Unexpected error from message handler: %v", err)
				}
				if resp.Err == nil {
					t.Errorf("Expected an error in response")
				}
			},
		},
	}

	for idx, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.WithValue(
				context.Background(),
				logging.CORRELATION_ID, fmt.Sprintf("test-%d", idx),
			)
			reply := make(chan messages.ImagePullResponse)

			tc.message.Context = ctx
			tc.message.ReplyTo = reply

			errChan := make(chan error)
			go func() { errChan <- tc.message.Handle(tc.client) }()

			select {
			case resp := <-reply:
				err := <-errChan
				tc.expects(t, resp, err)
			case <-time.After(10 * time.Millisecond):
				t.Errorf("Unexpected timeout")
			}

			close(reply)
			close(errChan)
		})
	}
}
