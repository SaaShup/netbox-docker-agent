# Netbox Docker Agent 

[![Github Issues](http://img.shields.io/github/issues/SaaShup/netbox-docker-agent)](https://github.com/SaaShup/netbox-docker-agent/issues)
[![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)

## Description

Agent to install on the docker server to manage containers though (netbox plugin)[https://github.com/SaaShup/netbox-docker-plugin].
![netbox-docker-agent](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/06f81159-1830-45d2-9cd0-b4a949ab086e)


## Settings

go to the (nodered admin page)[http://localhost:1880/nodered] to change the settings.

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

# Hosting
Check https://saashup.com for more information
