# Openapi To Hurl
Use the following package to generate hurl file from openapi specs: https://crates.io/crates/openapi-to-hurl

Then run hurl file using the following command:
```shell
hurl --variable host=HOST -u USERNAME:PASSWORD hurlfile
```

`prune.hurl` is a destructive integration suite intended only for the disposable compatibility daemon. Run it through `tests/compat/run.sh`, which supplies `host`, `dind`, and the seeded `nginx:alpine` image. It creates labeled fixtures and checks prune reports plus protected running resources. The compatibility runner also tests real dangling/tagged image deletion and populated BuildKit cache cleanup with `tests/compat/prune-test.mjs`.
