# Pruning from the dashboard or Paasbox

The Containers, Images, Networks, and Volumes pages have a **Prune** button. **Prune build cache** is available under Disk allocation on Overview. The confirmation dialog explains the deletion scope, accepts label/age filters where supported, and reports deleted records and reclaimed space after completion. Images default to dangling images; volumes default to unused anonymous volumes. Including unused tagged images or unused named volumes requires selecting the corresponding checkbox. Volumes and their data are permanently deleted when pruned. See [Docker's pruning semantics](https://docs.docker.com/engine/manage-resources/pruning/).

Paasbox can call `POST /api/engine/{resource}/prune`, where `resource` is `containers`, `images`, `networks`, `volumes`, or `build-cache`, using the agent's API Basic credentials. Requests accept either direct options or the existing webhook-style `data` envelope:

```sh
curl --fail-with-body -u "$API_USERNAME:$API_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"data":{"filters":{"until":["168h"],"label":["paasbox.cleanup=true"]}}}' \
  https://agent.example.com/api/engine/containers/prune
```

Unlike the legacy asynchronous resource writes, prune returns **200 only after Docker completes**, with Docker's original report (for example, `{"ContainersDeleted":["container-id"],"SpaceReclaimed":4096}`). A null deletion list means nothing was removed; image deletion records can contain both `Untagged` and `Deleted` entries. Network reports do not include reclaimed bytes. Do not automatically retry a timed-out request: the operation may have completed, so inspect live inventory first.

After image pruning completes, the agent refreshes and saves its local registry/image associations from Docker. Deleted references and registries with no remaining images disappear from the dashboard. This refresh does not require manager connectivity or change manager inventory records. Refresh failures are logged without changing the completed prune response; use **Discover registries** to retry.

Options:

| Option | Resources | Meaning |
| --- | --- | --- |
| `all` | images, volumes, build-cache | Boolean, default `false`; expands pruning to unused tagged images, unused named volumes, or all types of unused engine build cache |
| `filters` | all | Object of non-empty string arrays; container/image/network filters: `until`, `label`, `label!`; volume filters: `label`, `label!`; build-cache filters: `until`, `id`, `parent`, `type`, `description`, `inuse`, `shared`, `private` |
| `keep_storage` | build-cache | Non-negative integer specifying build cache bytes to retain |

An empty body uses the defaults. Unknown fields, unsupported filters, and invalid types return 400 before touching Docker. `all` must be supplied as an option, not as a raw `all` or `dangling` filter. Non-POST methods return 405. Existing authentication, cross-origin protection, and JSON limits also apply. Background event and registry refreshes do not block pruning. Overlapping prunes and queued resource requests or active mutations return 409; clients can retry after the current operation finishes. Engine rejection/unavailability is returned as an error, not a successful acknowledgment.

Configured managers receive best-effort success/failure **host journal callbacks** using the existing integration. A callback failure is logged and does not turn a completed Docker deletion into an API failure. The response's deleted identifiers are authoritative for reconciling Paasbox inventory: reports identify container/cache IDs, image IDs or tags, and volume/network names. The agent does not delete manager records itself. Running containers and resources referenced by containers remain protected by Docker. The build-cache endpoint targets this engine, not standalone Buildx builders. Registries cannot be pruned.

See [API and operations](OPERATIONS.md) for other resource actions, or return to the [quick start](../README.md).
