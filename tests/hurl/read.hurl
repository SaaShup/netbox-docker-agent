# Read-path coverage (A).
#
# Two families of read endpoints exist:
#   /api/engine/<type>  -> returns 202 immediately (an async ack; it syncs the
#                          daemon state to netbox, it does NOT return the list).
#   /api/<type>         -> returns 200 synchronously with the live Docker data.
#
# The existing tests.hurl only checked status + `isCollection`. Here we assert
# the actual Docker payload shape on the synchronous endpoints (where field
# drift across dockerd versions shows up) and cover /system/usage.

# --- networks: default bridge/host/none always exist ----------------------
GET {{host}}/api/networks
HTTP 200
[Asserts]
jsonpath "$" isCollection
jsonpath "$[*].Name" contains "bridge"
jsonpath "$[*].Name" contains "host"
jsonpath "$[*].Name" contains "none"
jsonpath "$[*].Id" exists
jsonpath "$[*].Driver" exists

# --- containers: live list (array, possibly empty) ------------------------
GET {{host}}/api/containers
HTTP 200
[Asserts]
jsonpath "$" isCollection

# --- images: live list (array, possibly empty) ----------------------------
GET {{host}}/api/images
HTTP 200
[Asserts]
jsonpath "$" isCollection

# --- volumes --------------------------------------------------------------
GET {{host}}/api/volumes
HTTP 200
[Asserts]
jsonpath "$.Volumes" isCollection
jsonpath "$.Warnings" == null

# --- /system/usage: previously untested; agent's aggregated disk usage ----
GET {{host}}/system/usage
HTTP 200
[Asserts]
jsonpath "$.images" isCollection
jsonpath "$.images.size" exists
jsonpath "$.images.shared_size" exists
jsonpath "$.containers" isCollection
jsonpath "$.containers.size_rootfs" exists
jsonpath "$.volumes" exists
jsonpath "$.build_cache" exists

# --- /api/engine/<type> acks (202) — smoke only ---------------------------
GET {{host}}/api/engine/containers
HTTP 202

GET {{host}}/api/engine/networks
HTTP 202

GET {{host}}/api/engine/volumes
HTTP 202

GET {{host}}/api/engine/images
HTTP 202

GET {{host}}/api/engine/registries
HTTP 202

GET {{host}}/api/engine/endpoint
HTTP 202
