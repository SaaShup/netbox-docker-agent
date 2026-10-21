POST {{host}}/api/engine/containers
```json
{"data":{"name":"compat-host-net","state":"none","image":{"name":"nginx","version":"alpine"}}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Captures]
image: jsonpath "$[?(@.Name=='/compat-host-net')].Image" nth 0
[Asserts]
jsonpath "$[?(@.Name=='/compat-host-net')]" count == 1

PUT {{host}}/api/engine/containers
```json
{"data":{"name":"compat-host-net","ContainerID":"compat-host-net","operation":"recreate","image":{"ImageID":"{{image}}"},"network_settings":[{"network":{"name":"host","driver":"host"}}]}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-host-net')].State.Status" contains "running"
jsonpath "$[?(@.Name=='/compat-host-net')].HostConfig.NetworkMode" contains "host"

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-host-net","operation":"stop"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-host-net')].State.Status" contains "exited"

DELETE {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-host-net"}}
```
HTTP 202
