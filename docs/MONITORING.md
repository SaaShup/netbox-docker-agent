# Monitoring

`/metrics` requires API authentication and exposes the original five families:

- `netbox_docker_agent_container_running`
- `netbox_docker_agent_container_exited`
- `netbox_docker_agent_container_stopped`
- `netbox_docker_agent_docker_daemon`
- `netbox_docker_agent_netbox_error_response`

The daemon metric deliberately retains the historical `/var/run/docker.socket` label. Container names retain their Docker leading slash. Container `status` labels use stable state values such as `running` and `running (unhealthy)`; elapsed time is excluded so aging does not create new Prometheus series. Health changes remain visible. Labels are escaped for Prometheus. A failed Docker connection reports zero; failed NetBox requests increment the error counter. Logs are structured JSON on stderr and startup information is on stdout.

Overview host details show system uptime (the operating system running the agent) and agent process uptime. Both refresh with the dashboard. When using a remote Docker daemon, system uptime refers to the agent host, not the remote daemon.

Follow container logs with:

```sh
docker compose logs -f
```

Return to the [quick start](../README.md).
