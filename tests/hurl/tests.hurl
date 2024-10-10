GET {{host}}/
HTTP 200
[Asserts]
body isString

GET {{host}}/api/containers
HTTP 200
[Asserts]
jsonpath "$" isCollection

GET {{host}}/api/engine/containers
HTTP 202
[Asserts]
jsonpath "$" isCollection

POST {{host}}/api/engine/containers
```json
{
  "data": {
    "ContainerID": "string",
    "id": 3.3,
    "image": {
      "name": "string",
      "version": "string"
    },
    "name": "string"
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

GET {{host}}/api/engine/images
HTTP 202
[Asserts]
jsonpath "$" isCollection

POST {{host}}/api/engine/images
```json
{
  "data": {
    "id": 3.3,
    "name": "string",
    "version": "string"
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

PUT {{host}}/api/engine/containers
```json
{
  "data": {
    "ContainerID": "string",
    "env": [
      "string"
    ],
    "hostname": "string",
    "id": 3.3,
    "image": "string",
    "labels": {},
    "mounts": [
      {
        "destination": "string",
        "driver": "string",
        "mode": "string",
        "name": "string",
        "rw": true,
        "source": "string",
        "type": "string"
      }
    ],
    "name": "string",
    "networks": {},
    "operation": "restart",
    "ports": {}
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

DELETE {{host}}/api/engine/containers
HTTP 202

GET {{host}}/api/engine/endpoint
HTTP 202
[Asserts]
jsonpath "$" isCollection

DELETE {{host}}/api/engine/images
HTTP 202

GET {{host}}/api/engine/networks
HTTP 202
[Asserts]
jsonpath "$" isCollection

POST {{host}}/api/engine/networks
```json
{
  "data": {
    "driver": "bridge",
    "id": 3.3,
    "name": "string"
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

DELETE {{host}}/api/engine/networks
HTTP 202

GET {{host}}/api/engine/registries
HTTP 202
[Asserts]
jsonpath "$" isCollection

POST {{host}}/api/engine/registries
```json
{
  "data": {
    "email": "string",
    "id": 3.3,
    "name": "string",
    "password": "string",
    "server": "string",
    "username": "string"
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

DELETE {{host}}/api/engine/registries
HTTP 202

GET {{host}}/api/engine/volumes
HTTP 202
[Asserts]
jsonpath "$" isCollection

POST {{host}}/api/engine/volumes
```json
{
  "data": {
    "driver": "local",
    "id": 3.3,
    "name": "string"
  }
}
```
HTTP 202
[Asserts]
jsonpath "$" isCollection

DELETE {{host}}/api/engine/volumes

GET {{host}}/api/images
HTTP 200
[Asserts]
jsonpath "$" isCollection

GET {{host}}/api/networks
HTTP 200
[Asserts]
jsonpath "$" isCollection

GET {{host}}/api/volumes
HTTP 200
[Asserts]
jsonpath "$" isCollection
jsonpath "$.Volumes" isCollection
jsonpath "$.Warnings" == null

GET {{host}}/doc
HTTP 200
[Asserts]
body isString

GET {{host}}/info
HTTP 200
[Asserts]
jsonpath "$" isCollection
jsonpath "$.configured" isString
jsonpath "$.docker" isCollection
jsonpath "$.docker.ApiVersion" isString
jsonpath "$.docker.Arch" isString
jsonpath "$.docker.BuildTime" isString
jsonpath "$.docker.Components" isCollection
jsonpath "$.docker.GitCommit" isString
jsonpath "$.docker.GoVersion" isString
jsonpath "$.docker.KernelVersion" isString
jsonpath "$.docker.MinAPIVersion" isString
jsonpath "$.docker.Os" isString
jsonpath "$.docker.Platform" isCollection
jsonpath "$.docker.Platform.Name" isString
jsonpath "$.docker.Version" isString
jsonpath "$.message" isString
jsonpath "$.version" isString

GET {{host}}/metrics
HTTP 200
[Asserts]
body isString

GET {{host}}/api/registries
HTTP 200
[Asserts]
jsonpath "$" isCollection
