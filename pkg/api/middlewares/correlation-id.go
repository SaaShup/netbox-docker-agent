package middlewares

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/saashup/docker-netbox-controller/internal/logging"
)

func CorrelationID(h http.Handler) http.Handler {
	return http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			correlationID := r.Header.Get("X-Correlation-ID")
			if correlationID == "" {
				correlationID = uuid.New().String()
			}

			ctx := context.WithValue(
				r.Context(),
				logging.CORRELATION_ID, correlationID,
			)

			h.ServeHTTP(w, r.WithContext(ctx))
		},
	)
}
