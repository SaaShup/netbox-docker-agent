# Docker Netbox Controller

This projects exposes the Docker client via a REST API designed to be consumed
by the [Docker Netbox plugin](https://github.com/saashup/netbox-docker-plugin).

## Build

Run:

```shell
$ make
```

## Usage

Run:

```shell
$ export DEBUG=true
$ export NETBOX_URL="..."
$ export NETBOX_TOKEN="..."
$ ./bin/docker-netbox-controller
```

The Swagger UI will be available at: http://localhost:7984/api/docs

## License

This project is released under the terms of the [BSD-3 License](./LICENSE.txt).
