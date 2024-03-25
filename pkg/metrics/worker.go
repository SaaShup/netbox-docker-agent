package metrics

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/vladopajic/go-actor/actor"

	"github.com/saashup/docker-netbox-controller/internal/logging"
	"github.com/saashup/docker-netbox-controller/pkg/controller"
	"github.com/saashup/docker-netbox-controller/pkg/controller/messages"
)

type worker struct {
	controllerMailbox actor.MailboxSender[controller.Message]
}

func newWorker(controllerMailbox actor.MailboxSender[controller.Message]) *worker {
	return &worker{controllerMailbox: controllerMailbox}
}

func (w *worker) DoWork(ctx actor.Context) actor.WorkerStatus {
	select {
	case <-ctx.Done():
		return actor.WorkerEnd

	case <-time.After(5 * time.Second):
		w.collect()
		return actor.WorkerContinue
	}
}

func (w *worker) collect() {
	ctx := context.WithValue(
		context.Background(),
		logging.CORRELATION_ID, uuid.New().String(),
	)

	slog.DebugContext(ctx, "Collecting metrics")

	reply := make(chan messages.ContainersListResponse)
	w.controllerMailbox.Send(
		ctx,
		&messages.ContainersListRequest{
			Context: ctx,
			ReplyTo: reply,
		},
	)
	resp := <-reply
	close(reply)

	if resp.Err != nil {
		slog.Error(resp.Err.Error())
	} else {
		updateContainerMetrics(resp.Containers)
	}
}
