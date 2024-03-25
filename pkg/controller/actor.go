package controller

import (
	"github.com/vladopajic/go-actor/actor"
)

func New(mailbox actor.MailboxReceiver[Message]) (actor.Actor, error) {
	worker, err := newWorker(mailbox)
	if err != nil {
		return nil, err
	}

	actor := actor.New(
		worker,
		actor.OptOnStop(worker.onStop),
	)

	return actor, nil
}
