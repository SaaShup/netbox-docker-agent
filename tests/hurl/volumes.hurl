# Volume lifecycle (G).
#
# create -> confirm it appears in /api/volumes -> delete -> confirm it is gone.
# Write ops are async (202), so we poll the synchronous /api/volumes read.

# === Create the volume (state=none triggers creation) =====================
POST {{host}}/api/engine/volumes
```json
{ "data": { "id": 1, "name": "compat-vol", "driver": "local", "state": "none" } }
```
HTTP 202

# === Poll until it exists =================================================
GET {{host}}/api/volumes
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$.Volumes[*].Name" contains "compat-vol"

# === Delete it ============================================================
DELETE {{host}}/api/engine/volumes
```json
{ "data": { "name": "compat-vol" } }
```
HTTP 202

# === Poll until it is gone ================================================
GET {{host}}/api/volumes
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$.Volumes[*].Name" not contains "compat-vol"
