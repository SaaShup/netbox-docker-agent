# Container operations (I).
#
# lifecycle.hurl covers start/stop; this covers the rest of the operations the
# agent's PUT endpoint supports: restart, kill, rename. Each write is async
# (202), so we poll /api/containers for the resulting state.

# === Ensure the image is present ==========================================
POST {{host}}/api/engine/images
```json
{ "data": { "id": 1, "name": "nginx", "version": "alpine", "size": 0, "ImageID": null } }
```
HTTP 202

GET {{host}}/api/images
[Options]
retry: 90
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[*].RepoTags[*]" contains "nginx:alpine"

# === Create + start ops-test ==============================================
POST {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "name": "ops-test", "state": "none", "image": { "name": "nginx", "version": "alpine" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/ops-test')]" count == 1

PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "ops-test", "operation": "start", "name": "ops-test", "image": { "name": "nginx" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/ops-test')].State.Status" contains "running"

# === kill -> exited =======================================================
# (kill is done before restart: the agent's restart runs an async wait that
#  would otherwise race a kill issued immediately after it.)
PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "ops-test", "operation": "kill", "name": "ops-test", "image": { "name": "nginx" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/ops-test')].State.Status" contains "exited"

# === restart -> running again =============================================
PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "ops-test", "operation": "restart", "name": "ops-test", "image": { "name": "nginx" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/ops-test')].State.Status" contains "running"

# === rename ops-test -> ops-renamed =======================================
PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "ops-test", "operation": "rename", "name": "ops-renamed", "image": { "name": "nginx" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/ops-renamed')]" count == 1
jsonpath "$[?(@.Name=='/ops-test')]" count == 0

# === Clean up =============================================================
DELETE {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "ops-renamed", "name": "ops-renamed" } }
```
HTTP 202
