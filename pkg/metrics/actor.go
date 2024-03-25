package metrics

import (
	"github.com/vladopajic/go-actor/actor"

	"github.com/saashup/docker-netbox-controller/pkg/controller"
)

func New(controllerMailbox actor.MailboxSender[controller.Message]) actor.Actor {
	worker := newWorker(controllerMailbox)
	return actor.New(
		worker,
		actor.OptOnStart(func(ctx actor.Context) { worker.collect() }),
	)
}
