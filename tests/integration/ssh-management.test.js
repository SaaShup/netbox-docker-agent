import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../../src/server.js';
import { hostSshKeys } from '../../src/host-ssh.js';
const publicKey=(await fs.readFile(new URL('../fixtures/ssh/ed25519.pub',import.meta.url),'utf8')).trim();
const basic=(user,password)=>'Basic '+Buffer.from(`${user}:${password}`).toString('base64');
function env(t,name,value){const old=process.env[name];if(value===undefined)delete process.env[name];else process.env[name]=value;t.after(()=>{if(old===undefined)delete process.env[name];else process.env[name]=old;});}
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(tmpdir(),'nda-mounted-ssh-')),file=path.join(directory,'authorized_keys');await fs.writeFile(file,'',{mode:0o600});
 env(t,'SSH_AUTHORIZED_KEYS_FILE',file);env(t,'DATAPATH',directory);env(t,'SSH_KEYS_ACCOUNT','hostuser');env(t,'API_USERNAME','dashboard');env(t,'API_PASSWORD','dashboard-secret');
 const server=createServer({docker:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();server.closeTerminals();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});});
 const api=(method='GET',data,headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/ssh-keys`,{method,headers:{authorization:basic('dashboard','dashboard-secret'),'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
 return {directory,file,api};
}

test('dashboard API authentication manages SSH without a separate login and updates the configured file directly with exact backups and unchanged inode',async t=>{
 const logs=[];t.mock.method(console,'info',entry=>logs.push(JSON.parse(entry)));
 const {api,file,directory}=await fixture(t);const before=await fs.stat(file);
 for(const authorization of ['',basic('owner','secret'),basic('dashboard','wrong')])assert.equal((await api('GET',undefined,{authorization})).status,401);
 let list=await(await api()).json();assert.equal(list.account,'hostuser');assert.deepEqual(list.keys,[]);
 let response=await api('POST',{publicKey,revision:list.revision});assert.equal(response.status,200);let result=await response.json();
 assert.equal(await fs.readFile(path.join(directory,'ssh-key-backups',result.backup),'utf8'),'');assert.equal(await fs.readFile(file,'utf8'),publicKey+'\n');
 assert.equal((await fs.stat(file)).ino,before.ino);assert.equal((await api('POST',{publicKey,revision:list.revision})).status,409);
 list=await(await api()).json();assert.equal((await api('POST',{publicKey,revision:list.revision})).status,409);
 assert.equal((await api('POST',{publicKey:'bad',revision:list.revision})).status,400);
 for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}])assert.equal((await api('DELETE',{id:list.keys[0].id,revision:list.revision},headers)).status,403);
 response=await api('PATCH',{});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, POST, DELETE');
 response=await api('DELETE',{id:list.keys[0].id,revision:list.revision});assert.equal(response.status,200);result=await response.json();
 assert.equal(await fs.readFile(file,'utf8'),'');assert.equal(await fs.readFile(path.join(directory,'ssh-key-backups',result.backup),'utf8'),publicKey+'\n');
 delete process.env.API_USERNAME;process.env.API_PASSWORD='saashup';delete process.env.SSH_KEYS_ACCOUNT;
 list=await(await api('GET',undefined,{authorization:basic('admin','saashup')})).json();assert.equal(list.account,'Host account');
 assert.equal((await api('POST',{publicKey,revision:list.revision},{authorization:basic('admin','saashup')})).status,200);
 const requests=logs.filter(entry=>entry.event==='ssh-key-request');
 assert.deepEqual(requests.map(entry=>entry.action),['POST','DELETE','POST']);
 for(const entry of requests){
  assert.deepEqual(Object.keys(entry).sort(),['action','event','time']);
  assert.equal(new Date(entry.time).toISOString(),entry.time);
 }
 const changes=logs.filter(entry=>entry.event==='ssh-key-change');
 assert.deepEqual(changes.map(entry=>entry.action),['add','remove','add']);
 for(const entry of changes)assert.deepEqual(Object.keys(entry).sort(),['action','event','fingerprint','time']);
});

test('disabled, missing, readonly and invalid files report failures without creating host files',async t=>{
 const {api,file}=await fixture(t);delete process.env.SSH_AUTHORIZED_KEYS_FILE;assert.equal((await api()).status,404);
 process.env.SSH_AUTHORIZED_KEYS_FILE=file;await fs.rm(file);assert.equal((await api()).status,502);await assert.rejects(fs.stat(file),{code:'ENOENT'});
 await fs.writeFile(file,'',{mode:0o400});const revision=(await(await api()).json()).revision;
 assert.equal((await api('POST',{publicKey,revision})).status,502);assert.equal(await fs.readFile(file,'utf8'),'');
 await fs.chmod(file,0o622);assert.equal((await api()).status,409);
});

test('simultaneous direct-file requests cannot lose updates',async t=>{
 const {api,directory}=await fixture(t);const revision=(await(await api()).json()).revision;
 const parts=publicKey.split(' '),blob=Buffer.from(parts[1],'base64');blob[blob.length-1]^=1;const different=`${parts[0]} ${blob.toString('base64')} second`;
 const responses=await Promise.all([api('POST',{publicKey,revision}),api('POST',{publicKey:different,revision})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await(await api()).json()).keys.length,1);assert.equal((await fs.readdir(path.join(directory,'ssh-key-backups'))).length,1);
});

test('direct-file configuration uses the default data path when DATAPATH is omitted',async t=>{
 const {file}=await fixture(t);delete process.env.DATAPATH;
 assert.deepEqual((await hostSshKeys('GET')).keys,[]);assert.equal(process.env.SSH_AUTHORIZED_KEYS_FILE,file);
});
