package logging

import (
	"context"
	"log/slog"
	"os"
)

type Handler struct {
	parent slog.Handler
}

func NewHandler() Handler {
	return Handler{
		parent: slog.NewTextHandler(
			os.Stdout,
			&slog.HandlerOptions{
				Level: loglevel,
			},
		),
	}
}

func (h Handler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.parent.Enabled(ctx, level)
}

func (h Handler) Handle(ctx context.Context, r slog.Record) error {
	correlationId := GetCorrelationID(ctx)
	if correlationId != "" {
		r.AddAttrs(slog.String("correlation_id", correlationId))
	}

	return h.parent.Handle(ctx, r)
}

func (h Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return Handler{h.parent.WithAttrs(attrs)}
}

func (h Handler) WithGroup(name string) slog.Handler {
	return Handler{h.parent.WithGroup(name)}
}
