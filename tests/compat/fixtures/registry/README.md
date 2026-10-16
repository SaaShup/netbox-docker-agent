# Registry test fixtures

`proxy.mjs` forwards HTTP and HTTPS requests to a real Distribution registry.
Its control endpoint rotates the backend htpasswd file and can interrupt a
chosen image layer after sending part of its body. The control port exists only
inside the disposable compatibility stack.

The certificate and key are public test fixtures. `server.crt` is signed by
`ca.crt` for `compat-registry-tls.test`. Tests install the CA only into the
disposable daemon's registry trust directory, and remove it during cleanup.
The matching-host, untrusted-CA, and wrong-host cases exercise Docker's TLS
verification; no TLS verification bypass is enabled.
