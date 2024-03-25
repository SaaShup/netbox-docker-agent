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

func VolumeCreate(controllerMailbox actor.MailboxSender[controller.Message]) usecase.Interactor {
	type request struct {
		Name   string `json:"name"`
		Driver string `json:"driver" enum:"local"`
	}

	type response struct {
		CorrelationID string  `header:"X-Correlation-ID" json:"-"`
		Success       bool    `json:"success"`
		Error         *string `json:"error"`
	}

	u := usecase.NewInteractor(
		func(ctx context.Context, request request, response *response) error {
			response.CorrelationID = logging.GetCorrelationID(ctx)

			reply := make(chan messages.VolumeCreateResponse)
			controllerMailbox.Send(
				ctx,
				&messages.VolumeCreateRequest{
					Context: ctx,
					ReplyTo: reply,
					Driver:  request.Driver,
					Name:    request.Name,
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

	u.SetName("volume_create")
	u.SetTitle("Create a volume")
	u.SetTags("volume")

	u.SetExpectedErrors(status.InvalidArgument)

	return u
}
