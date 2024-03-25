package config

import (
	"log/slog"

	"github.com/kelseyhightower/envconfig"
	"github.com/saashup/docker-netbox-controller/internal/logging"
)

type Config struct {
	Debug       bool       `default:"false" envconfig:"DEBUG"`
	LogLevel    slog.Level `default:"info" envconfig:"LOGLEVEL"`
	NetboxUrl   string     `required:"true" envconfig:"NETBOX_URL"`
	NetboxToken string     `required:"true" envconfig:"NETBOX_TOKEN"`
}

var config Config

func Load() error {
	err := envconfig.Process("", &config)

	if config.Debug {
		logging.SetLevel(slog.LevelDebug)
	} else {
		logging.SetLevel(config.LogLevel)
	}

	return err
}

func Get() Config {
	return config
}
