// Verify production defaults without reserving the host's fixed agent port.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mock } from 'node:test';
const listen = http.Server.prototype.listen;
mock.method(http.Server.prototype, 'listen', function(port, host, callback) {
  assert.equal(port, 1880);
  assert.equal(host, '0.0.0.0');
  return listen.call(this, 0, '127.0.0.1', callback);
});
