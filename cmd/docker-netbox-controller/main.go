package main

import (
	"log/slog"
	"os"

	"github.com/saashup/docker-netbox-controller/internal/config"
	"github.com/saashup/docker-netbox-controller/internal/logging"
	"github.com/saashup/docker-netbox-controller/internal/signal"
)

func main() {
	logger := slog.New(logging.NewHandler())
	slog.SetDefault(logger)

	err := app()
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
}

func app() error {
	err := config.Load()
	if err != nil {
		return err
	}

	a, err := newRootActor()
	if err != nil {
		return err
	}

	a.Start()
	defer a.Stop()

	<-signal.WaitForTermination()

	return nil
}
