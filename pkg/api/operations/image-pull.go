package operations

import (
	"context"

	"github.com/vladopajic/go-actor/actor"

	"github.com/swaggest/usecase"
	"github.com/swaggest/usecase/status"

	"github.com/saashup/docker-netbox-controller/internal/logging"
	"github.com/saashup/docker-netbox-controller/internal/types"
	"github.com/saashup/docker-netbox-controller/pkg/controller"
	"github.com/saashup/docker-netbox-controller/pkg/controller/messages"
)

func ImagePull(controllerMailbox actor.MailboxSender[controller.Message]) usecase.Interactor {
	type request struct {
		Registry *types.RegistryAuth `json:"registry"`
		FQName   string              `json:"name"`
	}

	type responseData struct {
		Digest string `json:"digest"`
	}

	type response struct {
		CorrelationID string        `header:"X-Correlation-ID" json:"-"`
		Success       bool          `json:"success"`
		Data          *responseData `json:"data"`
		Error         *string       `json:"error"`
	}

	u := usecase.NewInteractor(
		func(ctx context.Context, request request, response *response) error {
			response.CorrelationID = logging.GetCorrelationID(ctx)

			reply := make(chan messages.ImagePullResponse)
			controllerMailbox.Send(
				ctx,
				&messages.ImagePullRequest{
					Context:      ctx,
					ReplyTo:      reply,
					RegistryAuth: request.Registry,
					FQName:       request.FQName,
				},
			)
			resp := <-reply
			close(reply)

			if resp.Err != nil {
				response.Success = false
				response.Data = nil
				errStr := resp.Err.Error()
				response.Error = &errStr
			} else {
				response.Success = true
				response.Data = &responseData{
					Digest: resp.Digest,
				}
				response.Error = nil
			}

			return nil
		},
	)

	u.SetName("image_pull")
	u.SetTitle("Pull an image")
	u.SetTags("image")

	u.SetExpectedErrors(status.InvalidArgument)

	return u
}
