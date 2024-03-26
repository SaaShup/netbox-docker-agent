.PHONY: all
all:
	@mkdir -p bin/
	@go get ./...
	@go build -o bin/ ./...

.PHONY: test
test:
	@go test -v ./tests/specs/...

.PHONY: clean
clean:
	@rm -f docker-netbox-controller
