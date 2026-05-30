# Agent -> netbox contract (E).
#
# Write ops report their result back to netbox asynchronously. This test points
# the agent at a wiremock stand-in (the compat harness sets netbox_url to it)
# and asserts the agent actually sends the expected callbacks after a real
# container create. Requires the `netbox` variable (the mock's base URL),
# which run.sh passes. Skipped by `npm test` (which only runs tests.hurl).

# === Reset the request journal so we only see this test's callbacks =======
DELETE {{netbox}}/__admin/requests
HTTP 200

# === Trigger a real container create through the agent ====================
POST {{host}}/api/engine/containers
```json
{
  "data": {
    "id": 4242,
    "name": "compat-netbox-cb",
    "state": "none",
    "image": { "name": "nginx", "version": "alpine" }
  }
}
```
HTTP 202

# === The agent must PATCH the container back to netbox, with correct content
# Poll the mock's journal until a PATCH whose body carries our container has
# arrived, matched on structured fields (not substrings): the container name,
# its state, and the real ImageID the agent read from the daemon.
POST {{netbox}}/__admin/requests/count
[Options]
retry: 30
retry-interval: 1000
```json
{
  "method": "PATCH",
  "urlPath": "/api/plugins/docker/containers/",
  "bodyPatterns": [
    { "matchesJsonPath": "$[?(@.name == 'compat-netbox-cb')]" },
    { "matchesJsonPath": "$[?(@.state == 'created')]" },
    { "matchesJsonPath": "$[?(@.image.ImageID =~ /sha256:.*/)]" }
  ]
}
```
HTTP 200
[Asserts]
jsonpath "$.count" >= 1

# === ...and a success journal entry must be recorded for our container ====
POST {{netbox}}/__admin/requests/count
```json
{
  "method": "POST",
  "urlPath": "/api/extras/journal-entries/",
  "bodyPatterns": [
    { "matchesJsonPath": "$[?(@.assigned_object_id == 4242)]" },
    { "matchesJsonPath": "$[?(@.kind == 'success')]" }
  ]
}
```
HTTP 200
[Asserts]
jsonpath "$.count" >= 1

# === Clean up the container ===============================================
DELETE {{host}}/api/engine/containers
```json
{ "data": { "id": 4242, "ContainerID": "compat-netbox-cb", "name": "compat-netbox-cb" } }
```
HTTP 202
