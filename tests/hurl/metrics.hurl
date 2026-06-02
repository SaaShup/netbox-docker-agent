# Prometheus metrics content (K).
#
# tests.hurl only checks /metrics is a string. Here we assert the actual
# Prometheus exposition: the daemon-connectivity gauge (with its HELP/TYPE
# lines and a value of 1 since the agent is talking to a live daemon) and the
# netbox error counter.

GET {{host}}/metrics
HTTP 200
[Asserts]
body contains "# HELP netbox_docker_agent_docker_daemon"
body contains "# TYPE netbox_docker_agent_docker_daemon gauge"
# daemon reachable -> gauge value 1
body matches /netbox_docker_agent_docker_daemon\{socket="[^"]+"\} 1/
body contains "# TYPE netbox_docker_agent_netbox_error_response counter"
body contains "netbox_docker_agent_netbox_error_response"
