.PHONY: all
all:
	@mkdir -p bin/
	@go get ./...
	@go build -o bin/ ./...

.PHONY: clean
clean:
	@rm -f docker-netbox-controller
