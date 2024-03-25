package signal

import (
	"os"
	"os/signal"
	"syscall"
)

func WaitForTermination() <-chan struct{} {
	sig := make(chan os.Signal, 1)
	done := make(chan struct{})

	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sig
		close(done)
	}()

	return done
}
