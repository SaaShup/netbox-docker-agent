GET {{host}}/

GET {{host}}/api/containers

GET {{host}}/api/engine/containers

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

DELETE {{host}}/api/engine/containers

GET {{host}}/api/engine/endpoint

GET {{host}}/api/engine/images

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

DELETE {{host}}/api/engine/images

GET {{host}}/api/engine/networks

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

DELETE {{host}}/api/engine/networks

GET {{host}}/api/engine/registries

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

DELETE {{host}}/api/engine/registries

GET {{host}}/api/engine/volumes

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

DELETE {{host}}/api/engine/volumes

GET {{host}}/api/images

GET {{host}}/api/networks

GET {{host}}/api/registries

GET {{host}}/api/volumes

GET {{host}}/doc

GET {{host}}/info

GET {{host}}/metrics

