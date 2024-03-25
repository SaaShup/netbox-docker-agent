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

func ContainerRestart(controllerMailbox actor.MailboxSender[controller.Message]) usecase.Interactor {
	type request struct {
		ContainerID string `path:"container_id"`
	}

	type response struct {
		CorrelationID string  `header:"X-Correlation-ID" json:"-"`
		Success       bool    `json:"success"`
		Error         *string `json:"error"`
	}

	u := usecase.NewInteractor(
		func(ctx context.Context, request request, response *response) error {
			response.CorrelationID = logging.GetCorrelationID(ctx)

			reply := make(chan messages.ContainerRestartResponse)
			controllerMailbox.Send(
				ctx,
				&messages.ContainerRestartRequest{
					Context:     ctx,
					ReplyTo:     reply,
					ContainerID: request.ContainerID,
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

	u.SetName("container_restart")
	u.SetTitle("Restart a container")
	u.SetTags("container")

	u.SetExpectedErrors(status.InvalidArgument)

	return u
}
