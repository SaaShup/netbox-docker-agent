# Netbox Docker Agent

[![Code](https://img.shields.io/badge/code-nodered-aa4444)](https://nodered.org/)
[![Github Issues](http://img.shields.io/github/issues/SaaShup/netbox-docker-agent?color=blue)](https://github.com/SaaShup/netbox-docker-agent/issues)
[![Github Pull requests](https://img.shields.io/github/issues-pr/SaaShup/netbox-docker-agent?color=green)](https://github.com/SaaShup/netbox-docker-agent/pulls)
[![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)

## Description

Agent to install on the docker server to manage containers though [netbox plugin](https://github.com/SaaShup/netbox-docker-plugin).
![netbox-docker-agent](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/06f81159-1830-45d2-9cd0-b4a949ab086e)


## Settings

Go to the [nodered admin page](http://localhost:1880/nodered) to change the settings.
You can define username and password via envionment variable:
- API_USERNAME 
- API_PASSWORD (NOTE: password should be a hash of node-red admin hash-pw)
- ADMIN_USERNAME
- ADMIN_PASSWORD (NOTE: password should be a hash of node-red admin hash-pw)

You can disable node-red editor by setting ENABLE_EDITOR to any value.

You can disable docker exec command by setting DISABLE_EXEC to any value.

You can disable SSL checking by setting DISABLE_SSL_CHECK to any value.

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
Container must have **rw access to the docker unix socket** (/var/run/docker.sock)

A quick and simple way to test is to run `chmod a+rw /var/run/docker.sock`

Default access is *admin/saashup*

## Contribute

### Run locally

On the root of the project run:

```
npm install
DATAPATH=. npx node-red -u . -s settings_dev.js
```

### Run tests locally

On the root of the project run and the project running locally:

```
Docker:
cat ./netbox-docker-agent/tests/hurl/tests.hurl | docker run --rm --network netbox-docker-agent -i ghcr.io/orange-opensource/hurl:latest --test --color --variable host=http://netbox-docker-agent:1880 -u admin:saashup


NPM:
npm install --include=dev
npm run test
```

Then you can browse http://localhost:1880/nodered. Default access is *admin/saashup*.

## Connect

log into [ui page](http://localhost:1880) to see your docker assets

![Screenshot from 2024-01-30 18-40-14](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/2437410b-734d-4601-bbd1-745041e08529)

## Upgrading the agent

To upgrade the agent you have no specific jobs to run. Pull the latest version, stop and rm your container and run it with the same settings (**same config volumes**).
The agent has a mechanism to update netbox if it has been upgraded. After an agent upgrade you should see the new agent version on host information page.

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

# HELP netbox_docker_agent_netbox_error_response Show the netbox error response counter
# TYPE netbox_docker_agent_netbox_error_response counter
netbox_docker_agent_netbox_error_response{} 0
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

## Logs
Currently all logs are send to stdout, if netbox send an error message to the agent.

The format of the error message is the following one:
```
${data.name} level=${level[lvl]} version=${data.version} msg=${JSON.stringify(msg.msg)}
```

This can be changed by updating inside the INIT flow the "settings.js template" and change the logging.console.handler .

# Hosting
Check https://saashup.com for more information
