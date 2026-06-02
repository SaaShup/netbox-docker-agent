# Error / negative paths (J).
#
# Auth and graceful handling of unexpected input. The suite runs with global
# credentials (-u), so the unauthenticated case sends an explicit bad
# Authorization header to override them for that one request.

# === A request with bad credentials must be rejected ======================
GET {{host}}/api/containers
Authorization: Basic aW52YWxpZDppbnZhbGlk
HTTP 401

# === An unknown resource type is handled gracefully (202 ack, no crash) ===
GET {{host}}/api/engine/bogus
HTTP 202
