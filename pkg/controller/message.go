package controller

import "github.com/docker/docker/client"

type Message interface {
	Handle(*client.Client) error
}
