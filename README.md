# Netbox Docker Agent 

[![Github Issues](http://img.shields.io/github/issues/SaaShup/netbox-docker-agent)](https://github.com/SaaShup/netbox-docker-agent/issues)
[![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)

## Description

Agent to install on the docker server to manage containers though [netbox plugin](https://github.com/SaaShup/netbox-docker-plugin).
![netbox-docker-agent](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/06f81159-1830-45d2-9cd0-b4a949ab086e)


## Settings

go to the [nodered admin page](http://localhost:1880/nodered) to change the settings.

## Clean
```
docker stop netbox-docker-agent
docker rm netbox-docker-agent
docker image rm saashup/netbox-docker-agent
docker volume rm netbox-docker-agent
```
## Build
```
docker build -t saashup/netbox-docker-agent .
```
## Run
```
docker run -d -p 1880:1880 -v /var/run/docker.sock:/var/run/docker.sock:rw -v netbox-docker-agent:/data --name netbox-docker-agent saashup/netbox-docker-agent 
```
container must have **rw access to the docker unix socket** (/var/run/docker.sock)

Default access is *admin/saashup*

## Monitoring
The application has a '/metrics' endpoint which can be used with prometheus to monitor if the access on the docker daemon socket is working and if all the containers are up and running.

The following metrics are currently exposed:

```
# HELP netbox_docker_agent_container_running Show if a container is running
# TYPE netbox_docker_agent_container_running gauge
netbox_docker_agent_container_running{name="example-running", state="running", status="Up 5 seconds (health: starting)"} 1

# HELP netbox_docker_agent_container_exited Show if a container is exited
# TYPE netbox_docker_agent_container_exited gauge
netbox_docker_agent_container_exited{name="example-exited", state="exited", status="Exited (130) 6 months ago"} 1

# HELP netbox_docker_agent_container_stopped Show if a container is exited
# TYPE netbox_docker_agent_container_stopped gauge
netbox_docker_agent_container_stopped{name="example-stopped", state="stopped", status="Stopped"} 1

# HELP netbox_docker_agent_docker_daemon Show if the connection to the daemon is working
# TYPE netbox_docker_agent_docker_daemon gauge
netbox_docker_agent_docker_daemon{socket="/var/run/docker.socket"} 1
```

Example of prometheus configuration:

```
  - job_name: 'netbox-docker-agent'

    # Override the global default and scrape targets from this job every 5 seconds.
    scrape_interval: 5s

    static_configs:
      - targets: ['IP_ADDRESS:1880']
    metrics_path: "/metrics"
    basic_auth:
      username: 'admin'
      password: 'saashup'
```

# Hosting
Check https://saashup.com for more information
