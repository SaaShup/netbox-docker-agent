# Prune real resources in the isolated compatibility daemon. The main suite
# has already pulled nginx:alpine. A running container protects its resources.
POST {{dind}}/networks/create
```json
{"Name":"prune-used-net","Labels":{"compat.prune":"yes"}}
```
HTTP 201

POST {{dind}}/networks/create
```json
{"Name":"prune-unused-net","Labels":{"compat.prune":"yes"}}
```
HTTP 201

POST {{dind}}/volumes/create
```json
{"Name":"prune-used-volume","Labels":{"compat.prune":"yes"}}
```
HTTP 201

POST {{dind}}/volumes/create
```json
{"Name":"prune-unused-volume","Labels":{"compat.prune":"yes"}}
```
HTTP 201

POST {{dind}}/volumes/create
```json
{"Labels":{"compat.prune":"yes"}}
```
HTTP 201
[Captures]
anonymous_volume: jsonpath "$.Name"

POST {{dind}}/containers/create?name=prune-running
```json
{"Image":"nginx:alpine","Labels":{"compat.prune":"yes"},"HostConfig":{"NetworkMode":"prune-used-net","Mounts":[{"Type":"volume","Source":"prune-used-volume","Target":"/data"}]}}
```
HTTP 201
[Captures]
running_container: jsonpath "$.Id"

POST {{dind}}/containers/{{running_container}}/start
HTTP 204

POST {{dind}}/containers/create?name=prune-stopped
```json
{"Image":"nginx:alpine","Labels":{"compat.prune":"yes"}}
```
HTTP 201
[Captures]
stopped_container: jsonpath "$.Id"

POST {{host}}/api/engine/containers/prune
[Options]
retry: 10
retry-interval: 1000
```json
{"data":{"filters":{"label":["compat.prune=yes"]}}}
```
HTTP 200
[Asserts]
jsonpath "$.ContainersDeleted" contains "{{stopped_container}}"
jsonpath "$.ContainersDeleted" not contains "{{running_container}}"
jsonpath "$.SpaceReclaimed" >= 0

GET {{dind}}/containers/{{stopped_container}}/json
HTTP 404

# Anonymous-only default retains unused named volumes.
POST {{host}}/api/engine/volumes/prune
```json
{"filters":{"label":["compat.prune=yes"]}}
```
HTTP 200
[Asserts]
jsonpath "$.VolumesDeleted" contains "{{anonymous_volume}}"
jsonpath "$.VolumesDeleted" not contains "prune-unused-volume"

GET {{dind}}/volumes/prune-unused-volume
HTTP 200

POST {{host}}/api/engine/volumes/prune
```json
{"data":{"all":true,"filters":{"label":["compat.prune=yes"]}}}
```
HTTP 200
[Asserts]
jsonpath "$.VolumesDeleted" contains "prune-unused-volume"
jsonpath "$.VolumesDeleted" not contains "prune-used-volume"

GET {{dind}}/volumes/prune-used-volume
HTTP 200

POST {{host}}/api/engine/networks/prune
```json
{"filters":{"label":["compat.prune=yes"]}}
```
HTTP 200
[Asserts]
jsonpath "$.NetworksDeleted" contains "prune-unused-net"

GET {{dind}}/networks/prune-used-net
HTTP 200

POST {{host}}/api/engine/images/prune
```json
{}
```
HTTP 200
[Asserts]
jsonpath "$.SpaceReclaimed" >= 0

POST {{host}}/api/engine/images/prune
```json
{"all":true}
```
HTTP 200

GET {{dind}}/images/nginx:alpine/json
HTTP 200

POST {{host}}/api/engine/build-cache/prune
```json
{"data":{"all":false,"keep_storage":0,"filters":{"until":["24h"]}}}
```
HTTP 200
[Asserts]
jsonpath "$.SpaceReclaimed" >= 0

GET {{dind}}/containers/{{running_container}}/json
HTTP 200
[Asserts]
jsonpath "$.State.Running" == true

GET {{host}}/api/engine/containers/prune
HTTP 405

POST {{host}}/api/engine/containers/prune
Authorization: Basic YmFkOmJhZA==
HTTP 401

POST {{host}}/api/engine/volumes/prune
Origin: https://attacker.example
```json
{"all":true}
```
HTTP 403

POST {{host}}/api/engine/volumes/prune
```json
{"all":"true"}
```
HTTP 400

POST {{host}}/api/engine/images/prune
```json
{"filters":{"dangling":["false"]}}
```
HTTP 400

POST {{host}}/api/engine/registries/prune
HTTP 404

DELETE {{dind}}/containers/{{running_container}}?force=true
HTTP 204

DELETE {{dind}}/volumes/prune-used-volume
HTTP 204

DELETE {{dind}}/networks/prune-used-net
HTTP 204
