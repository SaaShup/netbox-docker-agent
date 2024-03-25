package operations

import (
	"context"

	"github.com/vladopajic/go-actor/actor"

	"github.com/swaggest/usecase"
	"github.com/swaggest/usecase/status"

	"github.com/saashup/docker-netbox-controller/internal/logging"
	"github.com/saashup/docker-netbox-controller/pkg/controller"
	"github.com/saashup/docker-netbox-controller/pkg/controller/messages"
)

func ImageRemove(controllerMailbox actor.MailboxSender[controller.Message]) usecase.Interactor {
	type request struct {
		Digest string `path:"digest"`
	}

	type response struct {
		CorrelationID string  `header:"X-Correlation-ID" json:"-"`
		Success       bool    `json:"success"`
		Error         *string `json:"error"`
	}

	u := usecase.NewInteractor(
		func(ctx context.Context, request request, response *response) error {
			response.CorrelationID = logging.GetCorrelationID(ctx)

			reply := make(chan messages.ImageRemoveResponse)
			controllerMailbox.Send(
				ctx,
				&messages.ImageRemoveRequest{
					Context: ctx,
					ReplyTo: reply,
					Digest:  request.Digest,
				},
			)
			resp := <-reply
			close(reply)

			if resp.Err != nil {
				response.Success = false
				errStr := resp.Err.Error()
				response.Error = &errStr
			} else {
				response.Success = true
				response.Error = nil
			}

			return nil
		},
	)

	u.SetName("image_remove")
	u.SetTitle("Remove an image")
	u.SetTags("image")

	u.SetExpectedErrors(status.InvalidArgument)

	return u
}
