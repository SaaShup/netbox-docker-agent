import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { WebSocket } from 'ws';
// Retains the original byte-code protocol for external terminal clients.
export class DockerExecClient extends EventEmitter {
  constructor(options) { super(); this.options = options; this.stdout = new PassThrough(); this.stderr = new PassThrough(); this.stdin = new PassThrough(); }
  async execute() {
    const url = new URL(this.options.url); url.searchParams.set('tty', this.options.tty === false ? 'false' : 'true');
    for (const part of Array.isArray(this.options.command) ? this.options.command : [this.options.command || 'sh']) url.searchParams.append('command', part);
    this.socket = new WebSocket(url, this.options.wsopts || {});
    const queue = []; let ready = false;
    this.stdin.on('data', data => { if (ready) this.send(0,data); else queue.push(data); });
    this.socket.on('message', message => { const data=Buffer.from(message); if(data[0]===1)this.stdout.write(data.subarray(1));if(data[0]===2)this.stderr.write(data.subarray(1));if(data[0]===100){ready=true;for(const chunk of queue.splice(0))this.send(0,chunk);}if(data[0]===101)ready=false;if(data[0]===200)this.emit('exit',data[1]);if(data[0]===202)this.emit('error',Error(data.subarray(1).toString())); });
    this.socket.on('close',()=>{this.stdout.end();this.stderr.end();});
    await new Promise((resolve,reject)=>{this.socket.once('open',resolve);this.socket.once('error',reject);});
    this.socket.on('error',error=>this.emit('error',error));
  }
  send(code,data=Buffer.alloc(0)){if(this.socket.readyState===WebSocket.OPEN)this.socket.send(Buffer.concat([Buffer.from([code]),Buffer.from(data)]));}
  resize(h,w){const data=Buffer.alloc(4);data.writeUInt16LE(h,0);data.writeUInt16LE(w,2);this.send(50,data);}
  close(){this.socket?.close();}
}
