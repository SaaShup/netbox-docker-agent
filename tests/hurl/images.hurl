# Image removal (H).
#
# pull a small image through the agent -> confirm it lands -> delete it ->
# confirm it is gone. Uses busybox so it is independent of the nginx:alpine
# the lifecycle test uses.

# === Pull busybox:latest through the agent ================================
POST {{host}}/api/engine/images
```json
{ "data": { "id": 1, "name": "busybox", "version": "latest", "size": 0, "ImageID": null } }
```
HTTP 202

# === Poll until the image lands in the daemon =============================
GET {{host}}/api/images
[Options]
retry: 90
retry-interval: 2000
HTTP 200
[Asserts]
jsonpath "$[*].RepoTags[*]" contains "busybox:latest"

# === Delete it ============================================================
DELETE {{host}}/api/engine/images
```json
{ "data": { "ImageID": "busybox:latest" } }
```
HTTP 202

# === Poll until it is gone ================================================
GET {{host}}/api/images
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[*].RepoTags[*]" not contains "busybox:latest"
