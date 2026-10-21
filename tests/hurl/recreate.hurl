# Verify the plugin's full reconfiguration contract on every Engine version.
POST {{host}}/api/engine/containers
```json
{"data":{"id":301,"name":"compat-recreate","state":"none","image":{"name":"nginx","version":"alpine"}}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Captures]
image: jsonpath "$[?(@.Name=='/compat-recreate')].Image" nth 0
old_id: jsonpath "$[?(@.Name=='/compat-recreate')].Id" nth 0
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')]" count == 1

POST {{host}}/api/engine/volumes
```json
{"data":{"name":"compat-recreate-data","driver":"local"}}
```
HTTP 202

POST {{host}}/api/engine/networks
```json
{"data":{"name":"compat-recreate-net","driver":"bridge","state":"creating"}}
```
HTTP 202

GET {{host}}/api/networks
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[*].Name" contains "compat-recreate-net"

PUT {{host}}/api/engine/containers
```json
{"data":{"id":301,"name":"compat-recreate","ContainerID":"compat-recreate","operation":"recreate","image":{"ImageID":"{{image}}"},"hostname":"reconfigured","env":[{"var_name":"PARITY","value":"a=b'quoted"}],"labels":[{"key":"test","value":"recreated"}],"cmd":["nginx","-g","daemon off;"],"restart_policy":"unless-stopped","cap_add":["NET_ADMIN"],"cap_drop":["MKNOD"],"extra_hosts":["parity.example:127.0.0.1"],"secOpt":["no-new-privileges"],"pid_mode":"host","devices":[{"host_path":"/dev/null","container_path":"/dev/parity-null"}],"ports":[{"private_port":80,"public_port":0,"type":"tcp"}],"network_settings":[{"network":{"name":"compat-recreate-net"}},{"network":{"name":"bridge"}}],"mounts":[{"source":"/parity-data","volume":{"name":"compat-recreate-data"},"read_only":true}],"binds":[{"host_path":"/tmp/compat-bind","container_path":"/parity-bind","read_only":false}],"sysctls":[{"key":"net.ipv4.ip_forward","value":"1"}],"log_driver":"json-file","log_driver_options":[{"option_name":"max-size","value":"10m"}]}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Captures]
new_id: jsonpath "$[?(@.Name=='/compat-recreate')].Id" nth 0
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')].Id" not contains "{{old_id}}"
jsonpath "$[?(@.Id=='{{old_id}}')]" count == 0
jsonpath "$[?(@.Name=='/compat-recreate')].State.Status" contains "running"
jsonpath "$[?(@.Name=='/compat-recreate')].Config.Hostname" contains "reconfigured"
jsonpath "$[?(@.Name=='/compat-recreate')].HostConfig.PidMode" contains "host"
jsonpath "$[?(@.Name=='/compat-recreate')].HostConfig.Devices[*].PathInContainer" contains "/dev/parity-null"
jsonpath "$[?(@.Name=='/compat-recreate')].Config.Env[*]" contains "PARITY=a=b'quoted"
jsonpath "$[?(@.Name=='/compat-recreate')].Config.Labels.test" contains "recreated"
jsonpath "$[?(@.Name=='/compat-recreate')].HostConfig.RestartPolicy.Name" contains "unless-stopped"
jsonpath "$[?(@.Name=='/compat-recreate')].HostConfig.LogConfig.Config.max-size" contains "10m"
jsonpath "$[?(@.Name=='/compat-recreate')].Mounts[*].Destination" contains "/parity-data"
jsonpath "$[?(@.Name=='/compat-recreate')].Mounts[*].Destination" contains "/parity-bind"

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate","operation":"pause"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')].State.Status" contains "paused"

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate","operation":"unpause"}}
```
HTTP 202

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate","name":"compat-recreate-saved","operation":"none","restart_policy":"no"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate-saved')].HostConfig.RestartPolicy.Name" contains "no"
jsonpath "$[?(@.Name=='/compat-recreate-saved')].State.Status" contains "running"

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate-saved","name":"compat-recreate","operation":"rename"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')]" count == 1

PUT {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate","operation":"stop"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')].State.Status" contains "exited"

DELETE {{host}}/api/engine/containers
```json
{"data":{"ContainerID":"compat-recreate"}}
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-recreate')]" count == 0

DELETE {{host}}/api/engine/volumes
```json
{"data":{"name":"compat-recreate-data"}}
```
HTTP 202

DELETE {{host}}/api/engine/networks
```json
{"data":{"name":"compat-recreate-net"}}
```
HTTP 202
