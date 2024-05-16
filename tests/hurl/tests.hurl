GET {{host}}/

HTTP *
[Asserts]

status < 400
body isString
GET {{host}}/api/containers

HTTP *
[Asserts]

status < 400
jsonpath "$" isCollection
GET {{host}}/api/engine/containers

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
DELETE {{host}}/api/engine/containers

HTTP *
[Asserts]
status < 400
GET {{host}}/api/engine/endpoint

HTTP *
[Asserts]
status < 400
GET {{host}}/api/engine/images

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
DELETE {{host}}/api/engine/images

HTTP *
[Asserts]
status < 400
GET {{host}}/api/engine/networks

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
DELETE {{host}}/api/engine/networks

HTTP *
[Asserts]
status < 400
GET {{host}}/api/engine/registries

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
DELETE {{host}}/api/engine/registries

HTTP *
[Asserts]
status < 400
GET {{host}}/api/engine/volumes

HTTP *
[Asserts]
status < 400
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

HTTP *
[Asserts]
status < 400
DELETE {{host}}/api/engine/volumes

HTTP *
[Asserts]
status < 400
GET {{host}}/api/images

HTTP *
[Asserts]

status < 400
jsonpath "$" isCollection
GET {{host}}/api/networks

HTTP *
[Asserts]

status < 400
jsonpath "$" isCollection
GET {{host}}/doc

HTTP *
[Asserts]

status < 400
body isString
GET {{host}}/info

HTTP *
[Asserts]

status < 400
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

HTTP *
[Asserts]

status < 400
body isString
