# Real container lifecycle (B) — the compatibility centerpiece.
#
# Drives a full workflow through the agent against a real daemon and verifies
# each step by its side effect. The write endpoints (/api/engine/...) return
# 202 and run asynchronously, so we poll the synchronous read endpoints
# (/api/containers, /api/images) with [Options] retry until the daemon
# reflects the change.
#
# The container is addressed by NAME throughout — Docker accepts a name
# wherever an id is expected, so no fragile id-capture is needed.
# Image: nginx:alpine (small, and stays running so logs/stats/exec are valid).

# === 1. Pull the image through the agent ==================================
# Request a pull of nginx:alpine. size:0 + ImageID:null are the field values
# that make the agent's "should we pull?" condition true, so it pulls.
POST {{host}}/api/engine/images
```json
{ "data": { "id": 1, "name": "nginx", "version": "alpine", "size": 0, "ImageID": null } }
```
HTTP 202

# === 2. Poll until the pull actually lands in the daemon ==================
GET {{host}}/api/images
[Options]
retry: 90
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[*].RepoTags[*]" contains "nginx:alpine"

# === 3. Create the container (state=none triggers creation) ===============
POST {{host}}/api/engine/containers
```json
{
  "data": {
    "id": 1,
    "name": "compat-lifecycle",
    "state": "none",
    "hostname": "compat-lifecycle",
    "image": { "name": "nginx", "version": "alpine" }
  }
}
```
HTTP 202

# === 4. Poll until the container exists ===================================
GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-lifecycle')]" count == 1

# === 5. Start it ==========================================================
PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "compat-lifecycle", "operation": "start", "name": "compat-lifecycle", "image": { "name": "nginx" } } }
```
HTTP 202

# === 6. Poll until it reports running ======================================
GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-lifecycle')].State.Status" contains "running"

# === 7. Logs (synchronous) =================================================
GET {{host}}/api/engine/containers/compat-lifecycle/logs
HTTP 200
[Asserts]
body isString

# === 8. Stats (synchronous, single snapshot) ===============================
GET {{host}}/api/engine/containers/compat-lifecycle/stats
HTTP 200
[Asserts]
jsonpath "$" exists

# === 9. Exec a command and read its output (synchronous) ==================
# The endpoint builds the exec from `cmd`, runs it against the daemon, and
# returns the output in a {stdout} envelope (carrying Docker's stream-
# multiplexing header bytes), so we assert the output contains our marker.
PUT {{host}}/api/engine/containers/compat-lifecycle/exec
```json
{ "cmd": ["echo", "hello-compat"] }
```
HTTP 200
[Asserts]
jsonpath "$.stdout" contains "hello-compat"

# === 10. Stop it ==========================================================
PUT {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "compat-lifecycle", "operation": "stop", "name": "compat-lifecycle", "image": { "name": "nginx" } } }
```
HTTP 202

# === 11. Poll until stopped ================================================
GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-lifecycle')].State.Status" contains "exited"

# === 12. Delete it ========================================================
DELETE {{host}}/api/engine/containers
```json
{ "data": { "id": 1, "ContainerID": "compat-lifecycle", "name": "compat-lifecycle" } }
```
HTTP 202

# === 13. Poll until it is gone =============================================
GET {{host}}/api/containers
[Options]
retry: 30
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[?(@.Name=='/compat-lifecycle')]" count == 0
