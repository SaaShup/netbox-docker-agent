package logging

import "log/slog"

var loglevel *slog.LevelVar = new(slog.LevelVar)

func init() {
	loglevel.Set(slog.LevelWarn)
}

func SetLevel(level slog.Level) {
	loglevel.Set(level)
}
