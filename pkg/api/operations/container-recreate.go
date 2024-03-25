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

func ContainerRecreate(controllerMailbox actor.MailboxSender[controller.Message]) usecase.Interactor {
	type request struct {
		Container types.ContainerSpec `json:"container"`
	}

	type responseData struct {
		ContainerID string `json:"container_id"`
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

			reply := make(chan messages.ContainerRecreateResponse)
			controllerMailbox.Send(
				ctx,
				&messages.ContainerRecreateRequest{
					Context: ctx,
					ReplyTo: reply,
					Spec:    request.Container,
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
					ContainerID: resp.ContainerID,
				}
				response.Error = nil
			}

			return nil
		},
	)

	u.SetName("container_recreate")
	u.SetTitle("Create or recreate a container")
	u.SetTags("container")

	u.SetExpectedErrors(status.InvalidArgument)

	return u
}
