package logging

import "context"

type ContextKey string

const CORRELATION_ID = ContextKey("correlation_id")

func GetCorrelationID(ctx context.Context) string {
	switch v := ctx.Value(CORRELATION_ID).(type) {
	case string:
		return v
	default:
		return ""
	}
}
