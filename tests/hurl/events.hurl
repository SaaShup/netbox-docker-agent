# dockerd event watcher -> netbox sync (events).
#
# The agent streams dockerd's /events and, when a container changes state, it
# looks the container up in netbox and PATCHes the new state back. This proves
# the agent reacts to actions taken DIRECTLY on the daemon, not via its own API.
#
# We use `pause` because the agent always processes pause/unpause events (other
# actions are gated on an internal flag the agent toggles around its own work).
# The pause is issued straight to the daemon over its TCP endpoint ({{dind}}),
# so any resulting callback can only have come from the event watcher.
#
# Requires the `dind` variable (the daemon's API base, e.g. http://dind:2375),
# which the compat harness passes.

# === Stub the netbox container lookup so the watcher finds our container ===
# The event flow only PATCHes when the lookup returns exactly one match.
POST {{netbox}}/__admin/mappings
```json
{
  "priority": 1,
  "request": {
    "method": "GET",
    "urlPathPattern": "/api/plugins/docker/containers/.*",
    "queryParameters": { "name": { "contains": "evt-container" } }
  },
  "response": {
    "status": 200,
    "headers": { "Content-Type": "application/json" },
    "jsonBody": { "count": 1, "results": [{ "id": 777, "name": "evt-container" }] }
  }
}
```
HTTP 201

# === Make sure the image is present =======================================
POST {{host}}/api/engine/images
```json
{ "data": { "id": 777, "name": "nginx", "version": "alpine", "size": 0, "ImageID": null } }
```
HTTP 202

GET {{host}}/api/images
[Options]
retry: 90
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[*].RepoTags[*]" contains "nginx:alpine"

# === Create + start the container through the agent =======================
POST {{host}}/api/engine/containers
```json
{ "data": { "id": 777, "name": "evt-container", "state": "none", "image": { "name": "nginx", "version": "alpine" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/evt-container')]" count == 1

PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 777, "ContainerID": "evt-container", "operation": "start", "name": "evt-container", "image": { "name": "nginx" } } }
```
HTTP 202

GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/evt-container')].State.Status" contains "running"

# === Reset the journal so we only see callbacks caused by the pause =======
DELETE {{netbox}}/__admin/requests
HTTP 200

# === Pause the container DIRECTLY on the daemon (out-of-band) ==============
POST {{dind}}/containers/evt-container/pause
HTTP 204

# === The event watcher must PATCH the paused state back to netbox ==========
POST {{netbox}}/__admin/requests/count
[Options]
retry: 30
retry-interval: 1000
```json
{
  "method": "PATCH",
  "urlPath": "/api/plugins/docker/containers/",
  "bodyPatterns": [
    { "matchesJsonPath": "$[?(@.name == 'evt-container')]" },
    { "matchesJsonPath": "$[?(@.state == 'paused')]" }
  ]
}
```
HTTP 200
[Asserts]
jsonpath "$.count" >= 1

# === Clean up: unpause (out-of-band) and delete via the agent =============
POST {{dind}}/containers/evt-container/unpause
HTTP 204

DELETE {{host}}/api/engine/containers
```json
{ "data": { "id": 777, "ContainerID": "evt-container", "name": "evt-container" } }
```
HTTP 202
