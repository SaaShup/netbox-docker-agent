# Daemon-version assertion (C).
#
# Proves the agent is actually talking to the dockerd version under test and
# surfaces its version metadata correctly. Requires the `docker_version`
# variable, which the compat harness (run.sh) always passes. Run it manually
# with: hurl --variable docker_version=29.5.2 ...

GET {{host}}/info
HTTP 200
[Asserts]
jsonpath "$.docker" isCollection
jsonpath "$.docker.Version" isString
jsonpath "$.docker.Version" == "{{docker_version}}"
jsonpath "$.docker.ApiVersion" matches /^\d+\.\d+$/
jsonpath "$.docker.MinAPIVersion" matches /^\d+\.\d+$/
jsonpath "$.docker.Os" == "linux"
