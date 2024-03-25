package api

import (
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/vladopajic/go-actor/actor"

	"github.com/swaggest/openapi-go/openapi31"
	"github.com/swaggest/rest/web"
	"github.com/swaggest/swgui/v5emb"

	"github.com/saashup/docker-netbox-controller/pkg/api/middlewares"
	"github.com/saashup/docker-netbox-controller/pkg/api/operations"
	"github.com/saashup/docker-netbox-controller/pkg/controller"
)

func newRouter(controllerMailbox actor.MailboxSender[controller.Message]) *web.Service {
	service := web.NewService(openapi31.NewReflector())
	service.OpenAPISchema().SetTitle("Docker Netbox Controller API")
	service.OpenAPISchema().SetDescription("Agent API for Docker Netbox Plugin")
	service.OpenAPISchema().SetVersion("0.1.0")

	service.Use(middlewares.CorrelationID)

	service.Handle("/metrics", promhttp.Handler())
	service.Docs("/api/docs", v5emb.New)

	service.Post(
		"/api/containers",
		operations.ContainerRecreate(controllerMailbox),
	)
	service.Put(
		"/api/containers/{container_id}/start",
		operations.ContainerStart(controllerMailbox),
	)
	service.Put(
		"/api/containers/{container_id}/stop",
		operations.ContainerStop(controllerMailbox),
	)
	service.Put(
		"/api/containers/{container_id}/restart",
		operations.ContainerRestart(controllerMailbox),
	)
	service.Delete(
		"/api/containers/{container_id}",
		operations.ContainerRemove(controllerMailbox),
	)

	service.Post(
		"/api/images",
		operations.ImagePull(controllerMailbox),
	)
	service.Delete(
		"/api/images/{digest}",
		operations.ImageRemove(controllerMailbox),
	)

	service.Post(
		"/api/volumes",
		operations.VolumeCreate(controllerMailbox),
	)
	service.Delete(
		"/api/volumes/{name}",
		operations.VolumeRemove(controllerMailbox),
	)

	return service
}
