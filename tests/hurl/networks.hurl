# Network lifecycle (bonus).
#
# create -> confirm it appears in /api/networks -> delete -> confirm it is gone.
# Note: unlike containers/volumes (state "none"), the network create path is
# gated on state == "creating".

# === Create the network ===================================================
POST {{host}}/api/engine/networks
```json
{ "data": { "id": 1, "name": "compat-net", "driver": "bridge", "state": "creating" } }
```
HTTP 202

# === Poll until it exists, with the expected driver =======================
GET {{host}}/api/networks
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[*].Name" contains "compat-net"
jsonpath "$[?(@.Name=='compat-net')].Driver" contains "bridge"

# === Delete it ============================================================
DELETE {{host}}/api/engine/networks
```json
{ "data": { "name": "compat-net" } }
```
HTTP 202

# === Poll until it is gone ================================================
GET {{host}}/api/networks
[Options]
retry: 30
retry-interval: 1000
HTTP 200
[Asserts]
jsonpath "$[*].Name" not contains "compat-net"
