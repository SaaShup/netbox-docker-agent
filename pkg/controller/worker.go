package controller

import (
	"log/slog"

	"github.com/docker/docker/client"
	"github.com/vladopajic/go-actor/actor"
)

type worker struct {
	mailbox actor.MailboxReceiver[Message]
	client  *client.Client
}

func newWorker(mailbox actor.MailboxReceiver[Message]) (*worker, error) {
	client, err := client.NewClientWithOpts(
		client.FromEnv,
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}

	worker := &worker{
		mailbox: mailbox,
		client:  client,
	}

	return worker, nil
}

func (w *worker) DoWork(ctx actor.Context) actor.WorkerStatus {
	select {
	case <-ctx.Done():
		return actor.WorkerEnd

	case msg, ok := <-w.mailbox.ReceiveC():
		if !ok {
			return actor.WorkerEnd
		}

		err := msg.Handle(w.client)
		if err != nil {
			slog.Error(err.Error())
			return actor.WorkerEnd
		}

		return actor.WorkerContinue
	}
}

func (w *worker) onStop() {
	err := w.client.Close()
	if err != nil {
		slog.Error(err.Error())
	}
}
