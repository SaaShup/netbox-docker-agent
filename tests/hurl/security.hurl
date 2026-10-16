# Authentication, browser-origin protection and input validation.
GET {{host}}/api/containers
Authorization: Basic YmFkOmJhZA==
HTTP 401

POST {{host}}/api/engine/containers
Origin: https://attacker.example
```json
{"data":{"name":"must-not-create","state":"none","image":{"name":"nginx","version":"alpine"}}}
```
HTTP 403

PUT {{host}}/api/engine/containers/missing/exec
```json
{"cmd":"id"}
```
HTTP 400

POST {{host}}/api/engine/images
Content-Type: application/json
```
{not json
```
HTTP 400
