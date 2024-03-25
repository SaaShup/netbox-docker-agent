package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/vladopajic/go-actor/actor"

	"github.com/saashup/docker-netbox-controller/pkg/controller"
)

type worker struct {
	httpServer *http.Server
}

func newWorker(controllerMailbox actor.MailboxSender[controller.Message]) *worker {
	return &worker{
		httpServer: &http.Server{
			Addr:    "0.0.0.0:7984",
			Handler: newRouter(controllerMailbox),
		},
	}
}

func (w *worker) DoWork(ctx actor.Context) actor.WorkerStatus {
	<-ctx.Done()
	return actor.WorkerEnd
}

func (w *worker) onStart(ctx actor.Context) {
	go func() {
		err := w.httpServer.ListenAndServe()
		switch err {
		case nil:
		case http.ErrServerClosed:
			slog.Info("API server stopped")
		default:
			slog.Error(err.Error())
		}
	}()

	slog.Info("API server started", "address", "0.0.0.0:7984")
}

func (w *worker) onStop() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	w.httpServer.Shutdown(ctx)
}
