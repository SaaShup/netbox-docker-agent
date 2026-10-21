import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { WebSocket } from 'ws';
import { terminals } from '../../src/terminal.js';
test('terminal shutdown sends the legacy shutdown code and closes gracefully; close is idempotent',async()=>{
 const server=http.createServer();const stream=new PassThrough();const docker={getContainer:()=>({exec:async()=>({start:async()=>stream})})};const terminal=terminals(server,docker);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const path=terminal.allow('abc');const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}${path}?command=sh&tty=true`,{headers:{authorization:'Basic '+Buffer.from('admin:saashup').toString('base64')}});
 try{const [ready]=await once(ws,'message');assert.equal(ready[0],100);const shutdown=once(ws,'message');const close=once(ws,'close');terminal.close();terminal.close();const[message]=await shutdown;assert.equal(message[0],201);const[code]=await close;assert.equal(code,1001);}finally{ws.terminate();terminal.close();stream.destroy();server.close();}
});
