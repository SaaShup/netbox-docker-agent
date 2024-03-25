package main

import (
	"github.com/vladopajic/go-actor/actor"

	"github.com/saashup/docker-netbox-controller/pkg/api"
	"github.com/saashup/docker-netbox-controller/pkg/controller"
	"github.com/saashup/docker-netbox-controller/pkg/metrics"
)

func newRootActor() (actor.Actor, error) {
	controllerMailbox := actor.NewMailbox[controller.Message]()

	controllerActor, err := controller.New(controllerMailbox)
	if err != nil {
		return nil, err
	}

	metricsActor := metrics.New(controllerMailbox)
	apiActor := api.New(controllerMailbox)

	a := actor.Combine(
		controllerMailbox,
		controllerActor,
		metricsActor,
		apiActor,
	).Build()

	return a, nil
}
