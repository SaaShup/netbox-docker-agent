import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Docker from 'dockerode';
import { WebSocket } from 'ws';
import { Store } from '../../src/config.js';
import { Netbox } from '../../src/netbox.js';
import { Agent } from '../../src/agent.js';
import { createServer } from '../../src/server.js';
const auth='Basic '+Buffer.from('admin:saashup').toString('base64');
const fixture={Id:'abc',Name:'/demo',Image:'sha256:image',Config:{Image:'nginx:alpine',Env:['X=1']},State:{Status:'created',ExitCode:0},HostConfig:{RestartPolicy:{Name:'no'},LogConfig:{Type:'json-file',Config:{}}},NetworkSettings:{Networks:{bridge:{}}},Mounts:[]};
async function setup(t) {
 const dir=await mkdtemp(path.join(tmpdir(),'nda-integration-'));const calls=[],callbacks=[];let events;
 const engine=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const url=new URL(req.url,'http://engine');const p=url.pathname.replace(/^\/v\d+\.\d+/,'');const body=raw?JSON.parse(raw):undefined;calls.push({method:req.method,path:p,query:url.search,body});
 const json=data=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(data));};
 if(p==='/events'){events=res;res.writeHead(200,{'Content-Type':'application/json'});res.write('\n');return;}
 if(p==='/version')return json({Version:'29.5.2',ApiVersion:'1.54'});
 if(p==='/info')return json({Name:'mock',Driver:'overlay2'});
 if(p==='/system/df')return json({Images:[],Containers:[],Volumes:[],BuildCache:[]});
 if(p.endsWith('/prune'))return json({[{'containers':'ContainersDeleted','images':'ImagesDeleted','volumes':'VolumesDeleted','networks':'NetworksDeleted','build':'CachesDeleted'}[p.split('/')[1]]]:p.startsWith('/images/')?[{Deleted:'sha256:pruned'}]:['pruned-id'],...(p.startsWith('/networks/')?{}:{SpaceReclaimed:4096})});
 if(p==='/containers/json')return json([{Id:'abc',State:'running',Names:['/demo'],Status:'Up'}]);
 if(p==='/containers/abc/json'||p==='/containers/demo/json')return json(fixture);
 if(p==='/containers/create')return json({Id:'abc',Warnings:[]});
 if(p==='/containers/abc/exec')return json({Id:'exec1'});
 if(p==='/exec/exec1/start'||p.endsWith('/logs')){res.end(Buffer.concat([Buffer.from([1,0,0,0,0,0,0,6]),Buffer.from('hello\n')]));return;}
 if(p.endsWith('/stats'))return json({cpu_stats:{cpu_usage:{total_usage:5}}});
 if(p==='/images/json')return json([{Id:'sha256:image',RepoTags:['nginx:alpine'],Size:1048576}]);
 if(p==='/volumes')return json({Volumes:[],Warnings:null});
 if(p==='/networks')return json([{Id:'net',Name:'bridge',Driver:'bridge'}]);
 if(p==='/networks/create')return json({Id:'net'});
 if(p==='/volumes/create')return json({Name:body.Name});
 if(p==='/images/create'){res.setHeader('content-type','application/json');res.end('{"status":"Digest: sha256:image"}\n');return;}
 if(p==='/images/nginx:alpine/json')return json({Id:'sha256:image',RepoTags:['nginx:alpine'],RepoDigests:['nginx@sha256:digest'],Size:1048576});
 if(req.method==='DELETE'&&p.startsWith('/images/'))return json([]);
 if(req.method==='POST'||req.method==='DELETE'){res.statusCode=204;res.end();return;}
 res.statusCode=404;json({message:`unhandled ${p}`});
 });engine.listen(0,'127.0.0.1');await once(engine,'listening');
 const nb=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;callbacks.push({method:req.method,url:req.url,auth:req.headers.authorization,body:raw?JSON.parse(raw):undefined});res.setHeader('content-type','application/json');res.end(JSON.stringify(req.method==='GET'&&req.url.includes('containers')?{count:1,results:[{id:7,name:'demo'}]}:{results:[]}));});nb.listen(0,'127.0.0.1');await once(nb,'listening');
 const store=await new Store(dir).load();Object.assign(store.config,{netbox_url:`http://127.0.0.1:${nb.address().port}`,netbox_token:'ntb_test',id:9});
 const docker=new Docker({host:'127.0.0.1',port:engine.address().port,protocol:'http'});const netbox=new Netbox(store),agent=new Agent(docker,store,netbox);agent.log=()=>{};const server=createServer(agent);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await agent.close();server.closeTerminals();server.closeAllConnections();server.close();events?.end();engine.closeAllConnections();engine.close();nb.closeAllConnections();nb.close();await rm(dir,{recursive:true,force:true});});
 const api=async(route,method='GET',data,headers={})=>fetch(base+route,{method,headers:{authorization:auth,...(data?{'content-type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
 return{agent,store,docker,netbox,api,base,calls,callbacks,engine,server,getEvents:()=>events};
}
test('standalone registry discovery refreshes local images through the HTTP route', async t => {
 const { api, agent, store, callbacks, docker } = await setup(t);
 store.config.netbox_url = '';
 assert.equal((await (await api('/api/registries')).json())[0].name, 'dockerhub');
 assert.equal((await api('/api/engine/registries')).status, 202);
 await Promise.all(agent.jobs);
 let registries = await (await api('/api/registries')).json();
 assert.equal(registries[0].name, 'dockerhub');
 assert.deepEqual(registries[0].images, ['nginx:alpine']);
 docker.listImages = async () => [{ RepoTags: ['private.test/team/app:v2'] }];
 assert.equal((await api('/api/engine/registries')).status, 202);
 await Promise.all(agent.jobs);
 registries = await (await api('/api/registries')).json();
 assert.deepEqual(registries.map(r => r.name), ['private.test']);
 assert.deepEqual(registries[0].images, ['private.test/team/app:v2']);
 const saved = await new Store(store.directory).load();
 assert.deepEqual(saved.registries, registries);
 assert.equal(callbacks.length, 0);
});
test('registry reads reconcile external image changes and retain saved metadata', async t => {
 const { api, store, docker, netbox } = await setup(t);
 store.registries = [{ id: 42, name: 'private.test', serveraddress: 'https://custom.test', images: ['private.test/app:removed'] }];
 netbox.resource = async () => { throw Error('manager offline'); };
 docker.listImages = async () => [{ RepoTags: ['private.test/app:current', 'private.test/app:alias'] }];
 let registries = await (await api('/api/registries')).json();
 assert.deepEqual(registries, [{ id: 42, name: 'private.test', serveraddress: 'https://custom.test', images: ['private.test/app:alias', 'private.test/app:current'] }]);
 docker.listImages = async () => [{ RepoDigests: ['new.test/app@sha256:digest'] }];
 registries = await (await api('/api/registries')).json();
 assert.equal(registries[0].name, 'new.test');
 assert.deepEqual(registries[0].images, ['new.test/app@sha256:digest']);
 assert.deepEqual((await new Store(store.directory).load()).registries, registries);
 docker.listImages = async () => [];
 assert.deepEqual(await (await api('/api/registries')).json(), []);
});

test('HTTP read contracts, assets and documentation use real Engine transport',async t=>{const {api}=await setup(t);for(const route of ['/','/app.js','/doc','/doc.js','/doc.css','/vendor/swagger-ui-bundle.js','/vendor/swagger-ui.css','/openapi','/openapi.json','/info','/system/usage','/api/containers','/api/images','/api/networks','/api/volumes','/api/registries','/metrics']){const r=await api(route);assert.equal(r.status,200,route);assert.equal(r.headers.get('x-content-type-options'),'nosniff');}assert.equal((await(await api('/api/containers')).json())[0].Name,'/demo');assert.equal((await(await api('/info')).json()).docker.Version,'29.5.2');assert.deepEqual((await(await api('/api/volumes')).json()).Volumes,[]);assert.equal((await(await api('/system/usage')).json()).images.size,0);});
test('asynchronous operations acknowledge and report NetBox callbacks, journals, authentication',async t=>{const {api,agent,calls,callbacks}=await setup(t);const data={id:7,name:'demo',state:'none',image:{name:'nginx',version:'alpine'}};const r=await api('/api/engine/containers','POST',{data});assert.equal(r.status,202);assert.deepEqual(await r.json(),{data});await Promise.all(agent.jobs);assert.equal(calls.find(x=>x.path==='/containers/create').body.Image,'nginx:alpine');const cb=callbacks.find(x=>x.method==='PATCH'&&x.url==='/api/plugins/docker/containers/');assert.equal(cb.body[0].image.ImageID,'sha256:image');assert.equal(cb.body[0].state,'created');assert.equal(cb.auth,'Bearer ntb_test');assert.equal(callbacks.find(x=>x.url==='/api/extras/journal-entries/').body.kind,'success');});
test('all container operations and resource lifecycles reach Engine endpoints',async t=>{const {agent,calls}=await setup(t);for(const operation of ['start','stop','restart','kill','pause','unpause','rename','none'])await agent.write('PUT','containers',{id:7,ContainerID:'abc',name:operation==='rename'?'renamed':'demo',operation,restart_policy:'always'});for(const operation of ['start','stop','restart','kill','pause','unpause','rename','update'])assert.ok(calls.some(x=>x.path===`/containers/abc/${operation}`),operation);await agent.write('POST','networks',{state:'creating',name:'n',driver:'bridge'});await agent.write('POST','volumes',{name:'v',driver:'local'});await agent.write('POST','images',{id:1,name:'nginx',version:'alpine',size:0,ImageID:null});for(const [type,d] of [['containers',{ContainerID:'abc'}],['images',{ImageID:'sha256:image'}],['volumes',{name:'v'}],['networks',{name:'n'}]])await agent.write('DELETE',type,d);assert.ok(calls.some(x=>x.path==='/images/create'));assert.ok(calls.some(x=>x.method==='DELETE'&&x.path==='/images/sha256:image'));});
test('container recreation preserves settings and rolls back a failed replacement',async t=>{const {agent,calls,docker}=await setup(t);await agent.write('PUT','containers',{id:7,name:'demo',ContainerID:'demo',operation:'recreate',image:{ImageID:'sha256:image'},env:[{var_name:'A',value:"a'b"}],network_settings:[]});const created=calls.find(x=>x.path==='/containers/create');assert.deepEqual(created.body.Env,["A=a'b"]);assert.ok(calls.some(x=>x.method==='DELETE'&&x.path==='/containers/abc'));docker.createContainer=async()=>{throw Error('create failed')};await assert.rejects(agent.write('PUT','containers',{id:7,name:'demo',ContainerID:'abc',operation:'recreate',image:{ImageID:'sha256:image'}}),/create failed/);assert.ok(calls.filter(x=>x.path==='/containers/abc/rename').some(x=>x.query==='?name=demo'));});
test('exec, logs and stats retain the legacy response envelopes',async t=>{const {api}=await setup(t);const result=await(await api('/api/engine/containers/abc/exec','PUT',{cmd:['echo','hello']})).json();assert.ok(result.stdout.includes('hello'));assert.equal(await(await api('/api/engine/containers/abc/logs')).text(),'hello\n');assert.equal((await(await api('/api/engine/containers/abc/stats')).json()).cpu_stats.cpu_usage.total_usage,5);assert.equal((await api('/api/engine/containers/abc/exec','PUT',{cmd:'whoami'})).status,400);});
test('NetBox inventory synchronization covers every resource and host metadata',async t=>{const {agent,callbacks}=await setup(t);for(const type of ['endpoint','networks','volumes','images','containers','registries'])await agent.sync(type);assert.ok(callbacks.some(x=>x.url==='/api/plugins/docker/hosts/'&&x.body[0].agent_version==='2.0.0-0'));assert.ok(callbacks.some(x=>x.url==='/api/plugins/docker/networks/'&&x.body.NetworkID==='net'));assert.ok(callbacks.some(x=>x.url==='/api/plugins/docker/containers/'&&x.body.ContainerID==='abc'));assert.ok(callbacks.some(x=>x.url==='/api/plugins/docker/images/'&&x.body.name==='nginx'));});
test('event stream reconnects after disconnect and synchronizes external state changes',async t=>{const {agent,getEvents,callbacks}=await setup(t);await agent.watch();await new Promise(r=>setTimeout(r,20));getEvents().write(JSON.stringify({Type:'container',Action:'pause',Actor:{ID:'abc'}})+'\n');await new Promise(r=>setTimeout(r,80));await Promise.all(agent.jobs);assert.ok(callbacks.some(x=>x.method==='PATCH'&&x.url==='/api/plugins/docker/containers/7/'));const first=getEvents();first.end();await new Promise(r=>setTimeout(r,1200));assert.notEqual(getEvents(),first);});
test('security rejects missing/wrong auth, cross-origin writes, malformed/oversized JSON and disabled exec',async t=>{const {api,base}=await setup(t);assert.equal((await fetch(base+'/api/containers')).status,401);assert.equal((await api('/api/containers','GET',undefined,{authorization:'Basic eDp5'})).status,401);assert.equal((await api('/api/engine/containers','POST',{data:{}},{origin:'https://evil.example'})).status,403);assert.equal((await api('/api/engine/endpoint?url=http://localhost','GET',undefined,{origin:'https://evil.example'})).status,403);assert.equal((await fetch(base+'/api/engine/containers',{method:'POST',headers:{authorization:auth},body:'{'})).status,400);assert.equal((await api('/api/engine/containers','POST',{data:{name:'x'.repeat(1024*1024)}})).status,413);assert.equal((await api('/../package.json')).status,404);process.env.DISABLE_EXEC='1';try{const disabled=await api('/api/engine/containers/abc/exec','PUT',{cmd:['id']});assert.equal(disabled.status,200);assert.deepEqual(await disabled.json(),{AttachStdin:false,AttachStdout:true,AttachStderr:true,Tty:false,Cmd:['id']});assert.equal((await api('/api/engine/containers/abc/ws','POST')).status,403);}finally{delete process.env.DISABLE_EXEC;}});
test('WebSocket upgrade requires credentials and same-origin even after reservation',async t=>{const {api,base}=await setup(t);const result=await(await api('/api/engine/containers/abc/ws','POST')).json();assert.equal(result.path,'/ws/engine/containers/abc/exec');for(const headers of [{},{authorization:auth,origin:'https://evil.example'}]){const ws=new WebSocket(base.replace('http:','ws:')+result.path,{headers});const [err]=await once(ws,'error');assert.match(err.message,/403/);}});
test('endpoint registration persists credentials; disconnect resets configuration',async t=>{const {api,store,agent}=await setup(t);assert.equal((await api('/api/engine/endpoint?url=ftp://example.com')).status,400);assert.equal((await api('/api/engine/endpoint?url=&id=17&token=legacy&endpoint=http://agent:1880')).status,202);assert.equal(store.config.id,'17');assert.equal(store.config.netbox_token,'legacy');await api('/api/engine/endpoint','DELETE');await Promise.all(agent.jobs);assert.equal(store.config.netbox_url,'');assert.equal(store.config.netbox_token,'');});
test('NetBox errors increment metric counter and legacy tokens use Token auth',async t=>{const {netbox,store,callbacks}=await setup(t);store.config.netbox_token='legacy';await netbox.resource('GET','hosts');assert.equal(callbacks.at(-1).auth,'Token legacy');store.config.netbox_url='http://127.0.0.1:1';await assert.rejects(netbox.resource('GET','hosts'));assert.equal(netbox.errors,1);});
test('configuration uses API credentials, ignores retired admin credentials and removes the Node-RED route',async t=>{
 const {api,store}=await setup(t);
 const previous=Object.fromEntries(['API_USERNAME','API_PASSWORD','ADMIN_USERNAME','ADMIN_PASSWORD'].map(key=>[key,process.env[key]]));
 process.env.API_USERNAME='dashboard';process.env.API_PASSWORD='dashboard-secret';
 process.env.ADMIN_USERNAME='old-admin';process.env.ADMIN_PASSWORD='old-secret';
 const headers={authorization:'Basic '+Buffer.from('dashboard:dashboard-secret').toString('base64')};
 try {
  for(const authorization of ['',auth,'Basic '+Buffer.from('old-admin:old-secret').toString('base64')]) {
   assert.equal((await api('/admin/config','GET',undefined,{authorization})).status,401);
   assert.equal((await api('/admin/config','PATCH',{id:0},{authorization})).status,401);
  }
  const read=await api('/admin/config','GET',undefined,headers);assert.equal(read.status,200);
  assert.equal((await api('/admin/config','PATCH',{ui:0,id:99},headers)).status,200);
  assert.equal(store.config.ui,0);assert.equal(store.config.id,99);
  assert.equal((await api('/api/containers','GET',undefined,headers)).status,200);
  for(const method of ['GET','HEAD','POST']) {
   const result=await api('/nodered',method,undefined,headers);assert.equal(result.status,404);assert.equal(result.headers.get('location'),null);
  }
 } finally {
  for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
test('host-state guards prevent destructive Docker requests; endpoint refresh clears and reimports inventories',async t=>{const {agent,calls,callbacks}=await setup(t);const count=calls.length;await agent.write('DELETE','containers',{ContainerID:'abc',host:{state:'deleted'}});await agent.write('DELETE','volumes',{name:'keep',host:{state:'refreshing'}});assert.equal(calls.length,count);await agent.write('POST','endpoint',{operation:'refresh',state:'refreshing',containers:[{id:7}],images:[{id:8}],volumes:[{id:9}],networks:[{id:10}]});for(const type of ['containers','images','volumes','networks'])assert.ok(callbacks.some(x=>x.method==='DELETE'&&x.url===`/api/plugins/docker/${type}/`));assert.ok(callbacks.some(x=>x.url==='/api/extras/journal-entries/'&&x.body.comments==='agent refreshed'));});
test('forced image changes archive the prior record and publish a new version',async t=>{const {agent,callbacks}=await setup(t);await agent.write('POST','images',{id:8,name:'nginx',version:'alpine',ImageID:'sha256:oldimage',Digest:'sha256:old',force:true,registry:{id:3,name:'registry',serveraddress:'https://registry'},display:'nginx:alpine'});assert.ok(callbacks.some(x=>x.method==='PATCH'&&x.url==='/api/plugins/docker/images/'&&x.body[0].version==='oldimage'));assert.ok(callbacks.some(x=>x.method==='POST'&&x.url==='/api/plugins/docker/images/'&&x.body.ImageID==='sha256:image'));assert.equal(agent.store.registries[0].images[0],'nginx:alpine');});
test('self recreation is rejected over HTTP for both ID and name without Docker mutations', async t => {
 const { agent, api, calls } = await setup(t); const old = process.env.HOSTNAME;
 process.env.HOSTNAME = 'abc';
 try {
  assert.equal((await (await api('/info')).json()).containerId, 'abc');
  for (const ContainerID of ['abc', 'demo']) {
   const response = await api('/api/engine/containers', 'PUT', { data: { ContainerID, name: 'demo', operation: 'recreate' } });
   assert.equal(response.status, 403); assert.match((await response.json()).message, /cannot recreate its own container/);
  }
  assert.equal(agent.jobs.size, 0);
  assert.equal(calls.some(c => c.method !== 'GET'), false);
  process.env.HOSTNAME = 'other-agent';
  assert.equal((await api('/api/engine/containers', 'PUT', { data: { ContainerID: 'abc', name: 'demo', operation: 'recreate', image: { ImageID: 'sha256:image' } } })).status, 202);
  await Promise.all(agent.jobs);
  assert.ok(calls.some(c => c.path === '/containers/create'));
 } finally { if (old === undefined) delete process.env.HOSTNAME; else process.env.HOSTNAME = old; }
});
test('startup reports restart, requests version refresh and loads registry associations',async t=>{const {agent,callbacks}=await setup(t);agent.start();await Promise.all(agent.jobs);assert.ok(callbacks.some(x=>x.url==='/api/extras/journal-entries/'&&x.body.comments==='agent restarted'));assert.ok(callbacks.some(x=>x.method==='PATCH'&&x.url==='/api/plugins/docker/hosts/'&&x.body[0].operation==='refresh'));assert.ok(callbacks.some(x=>x.method==='GET'&&x.url.includes('/api/plugins/docker/registries/')));});
test('NetBox TLS rejects untrusted certificates unless DISABLE_SSL_CHECK is explicitly set',async t=>{
 const https=await import('node:https');const{readFile}=await import('node:fs/promises');
 const server=https.createServer({key:await readFile(new URL('../fixtures/localhost-key.pem',import.meta.url)),cert:await readFile(new URL('../fixtures/localhost-cert.pem',import.meta.url))},(req,res)=>{res.end('{}')});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const netbox=new Netbox({config:{netbox_url:`https://127.0.0.1:${server.address().port}`,netbox_token:'test'}});
 await assert.rejects(netbox.resource('GET','hosts'));assert.equal(netbox.errors,1);
 process.env.DISABLE_SSL_CHECK='1';try{assert.deepEqual(await netbox.resource('GET','hosts'),{});}finally{delete process.env.DISABLE_SSL_CHECK;}
});
test('Docker progress error frames fail image pulls and create danger journals',async t=>{const {agent,docker,callbacks}=await setup(t);docker.pull=async()=>{const stream=new PassThrough();stream.end('{"error":"registry denied access"}\n');return stream;};await assert.rejects(agent.write('POST','images',{id:11,name:'private/app',version:'latest',size:0,ImageID:null}),/registry denied access/);assert.ok(callbacks.some(x=>x.url==='/api/extras/journal-entries/'&&x.body.kind==='danger'));assert.equal(callbacks.filter(x=>x.method==='PATCH'&&x.url==='/api/plugins/docker/images/').length,0);});
test('terminal styles use unique per-page CSP nonces without inline script permissions',async t=>{const {api}=await setup(t);const first=await api('/'),second=await api('/');const csp=first.headers.get('content-security-policy');const html=await first.text();assert.ok(!csp.includes('unsafe-inline'));assert.match(csp,/script-src 'self';/);const nonce=html.match(/name="style-nonce" content="([^"]+)"/)[1];assert.ok(csp.includes(`'nonce-${nonce}'`));assert.notEqual(csp,second.headers.get('content-security-policy'));});
test('volume size options follow the daemon storage driver and registry discovery creates remote associations',async t=>{const {agent,docker,calls,netbox}=await setup(t);docker.info=async()=>({Driver:'btrfs'});await agent.write('POST','volumes',{name:'bounded',driver:'local',max_size:128});assert.deepEqual(calls.find(x=>x.path==='/volumes/create').body.DriverOpts,{o:'size=128m'});docker.listImages=async()=>[{Id:'sha256:registry',RepoTags:['private.example:5000/ns/app:v1'],Size:1}];const original=netbox.resource.bind(netbox);netbox.resource=async(method,type,data,suffix)=>type==='registries'?(method==='GET'?{results:[]}:[{id:42,name:'private.example:5000'}]):original(method,type,data,suffix);const registries=await agent.registries();assert.equal(registries[0].name,'private.example:5000');assert.equal(registries[0].id,42);assert.deepEqual(registries[0].images,['private.example:5000/ns/app:v1']);});
test('lifecycle events are gated during operations while pause/unpause continue to synchronize',async t=>{const {agent,docker,callbacks}=await setup(t);let release,started;const entered=new Promise(resolve=>{started=resolve});const blocked=new Promise(resolve=>{release=resolve});const get=docker.getContainer.bind(docker);docker.getContainer=id=>{const container=get(id);container.start=async()=>{started();await blocked;};return container;};const operation=agent.write('PUT','containers',{id:7,ContainerID:'abc',operation:'start'});await entered;assert.equal(agent.activeOperations,1);const before=callbacks.filter(x=>x.method==='PATCH').length;await agent.event({Type:'container',Action:'start',Actor:{ID:'abc'}});assert.equal(callbacks.filter(x=>x.method==='PATCH').length,before);await agent.event({Type:'container',Action:'pause',Actor:{ID:'abc'}});assert.ok(callbacks.filter(x=>x.method==='PATCH').length>before);release();await operation;assert.equal(agent.activeOperations,0);const after=callbacks.length;await agent.event({Type:'container',Action:'die',Actor:{ID:'abc'}});assert.ok(callbacks.length>after);});
test('operation none retains the legacy combined restart-policy update and optional rename',async t=>{const {agent,calls,callbacks}=await setup(t);await agent.write('PUT','containers',{id:7,ContainerID:'demo',name:'saved-name',operation:'none',restart_policy:'always'});assert.ok(calls.some(x=>x.path==='/containers/abc/update'&&x.body.RestartPolicy.Name==='always'));assert.ok(calls.some(x=>x.path==='/containers/abc/rename'&&x.query==='?name=saved-name'));assert.ok(callbacks.some(x=>x.url==='/api/plugins/docker/containers/'&&x.body[0].ContainerID==='abc'));});
test('cross-site browser GETs cannot register an endpoint or trigger inventory writes without an Origin header',async t=>{const {api,store}=await setup(t);const original=store.config.netbox_url;const headers={'sec-fetch-site':'cross-site'};assert.equal((await api('/api/engine/endpoint?url=https://attacker.example','GET',undefined,headers)).status,403);assert.equal(store.config.netbox_url,original);assert.equal((await api('/api/engine/containers','GET',undefined,headers)).status,403);assert.equal((await api('/api/engine/endpoint','GET')).status,202);});

test('configuration URL validation and environment overrides retain their contracts', async t => {
 const {api,store}=await setup(t);
 const oldURL=process.env.NETBOX_URL;
 try {
  assert.equal((await api('/admin/config','PATCH',{netbox_url:'ftp://bad'})).status,400);
  process.env.NETBOX_URL='http://environment-manager';
  assert.equal((await api('/admin/config','PATCH',{netbox_url:'https://requested-manager',endpoint:'http://agent',netbox_token:'test',ui:0,id:5})).status,200);
  assert.equal(store.config.netbox_url,'http://environment-manager');
  assert.equal((await api('/','HEAD')).status,200);
 } finally {
  if(oldURL===undefined)delete process.env.NETBOX_URL;else process.env.NETBOX_URL=oldURL;
 }
});

test('HTTP input rejects non-object JSON and handles empty logs and disappeared terminals', async t => {
 const {api,base,docker,agent,store}=await setup(t);
 for(const input of ['null','[]','true','"text"']) {
  const response=await fetch(base+'/api/engine/containers',{method:'POST',headers:{authorization:auth},body:input});
  assert.equal(response.status,400);
 }
 const get=docker.getContainer.bind(docker);
 docker.getContainer=id=>{const c=get(id);c.logs=async()=>Buffer.alloc(0);return c;};
 assert.equal(await(await api('/api/engine/containers/abc/logs')).text(),'{}');
 assert.equal((await api('/api/engine/containers/missing/ws','POST')).status,404);
 docker.listVolumes=async()=>({});
 assert.deepEqual(await(await api('/api/volumes')).json(),{Volumes:[],Warnings:null});
 assert.equal((await api('/api/engine/containers','GET')).status,202);await Promise.all(agent.jobs);
 assert.equal((await api(`/api/engine/endpoint?url=${encodeURIComponent(store.config.netbox_url)}`)).status,202);
 await Promise.all(agent.jobs);
 assert.equal(store.config.id,'');assert.equal(store.config.endpoint,'');assert.equal(store.config.netbox_token,'');
 for(const statusCode of [undefined,200,700]) {
  docker.info=async()=>{throw Object.assign(Error('engine failure'),{statusCode});};
  agent.usage=()=>docker.info();
  assert.equal((await api('/system/usage')).status,statusCode===undefined?502:500);
 }
});

test('an HTTP client disconnect during a read does not turn into an unhandled response error', async t => {
 const {agent,base,server}=await setup(t);let finish,entered;
 const ready=new Promise(resolve=>{entered=resolve;});
 agent.info=()=>new Promise(resolve=>{finish=resolve;entered();});
 const disconnected=new Promise(resolve=>server.once('request',(_,response)=>response.once('close',resolve)));
 const request=http.get(base+'/info',{headers:{authorization:auth}});
 request.on('error',()=>{});
 await ready;
 request.destroy();await disconnected;
 finish({configured:'ok'});await new Promise(setImmediate);
});

test('settings and rename callbacks preserve configuration staged for recreation', async t => {
 const {api,agent,callbacks}=await setup(t);
 for(const operation of ['none','rename']) {
  const before=callbacks.length;
  const data={id:7,ContainerID:'abc',name:'demo',operation,restart_policy:'always',env:[{var_name:'SAASHUP_OWNER',value:'owner@example.test'}],labels:[{key:'traefik.enable',value:'true'}],ports:[{private_port:80,public_port:8080,type:'tcp'}]};
  assert.equal((await api('/api/engine/containers','PUT',{data})).status,202);
  await Promise.all(agent.jobs);
  const callback=callbacks.slice(before).find(c=>c.method==='PATCH'&&c.url==='/api/plugins/docker/containers/');
  assert.equal(callback.body[0].ContainerID,'abc');
  assert.equal(callback.body[0].operation,'none');
  for(const key of ['env','labels','ports','mounts','binds','network_settings','image','cmd','log_driver','log_driver_options','sysctls'])assert.equal(Object.hasOwn(callback.body[0],key),false,key);
 }
});

test('saved owner metadata and configuration survive the next HTTP recreation', async t => {
 const {api,agent,docker,callbacks}=await setup(t);
 const desired={id:7,ContainerID:'abc',name:'demo',operation:'none',restart_policy:'always',image:{ImageID:'sha256:upgraded'},env:[{var_name:'SAASHUP_OWNER',value:'owner@example.test'},{var_name:'EMPTY',value:''}],labels:[{key:'traefik.enable',value:'true'}],ports:[{private_port:80,public_port:8080,type:'tcp'}],mounts:[{source:'/data',volume:{name:'persistent-data'},read_only:false}],log_driver:'local',log_driver_options:[{option_name:'max-size',value:'10m'}]};
 assert.equal((await api('/api/engine/containers','PUT',{data:desired})).status,202);
 await Promise.all(agent.jobs);
 // Apply the agent's callback as the manager would before sending recreate.
 const saved=callbacks.find(c=>c.method==='PATCH'&&c.url==='/api/plugins/docker/containers/').body[0];
 const next={...desired,...saved,operation:'recreate'};
 let created;
 docker.createContainer=async options=>{
  created=options;
  return {id:'replacement',start:async()=>{},inspect:async()=>({
   ...fixture,Id:'replacement',Image:options.Image,
   State:{Status:'running',Running:true,ExitCode:0,StartedAt:new Date().toISOString()},
   Config:{Env:options.Env,Labels:options.Labels},HostConfig:options.HostConfig,
   Mounts:[{Type:'volume',Name:'persistent-data',Destination:'/data',RW:true}],
  })};
 };
 assert.equal((await api('/api/engine/containers','PUT',{data:next})).status,202);
 await Promise.all(agent.jobs);
 assert.equal(created.Image,'sha256:upgraded');
 assert.deepEqual(created.Env,['SAASHUP_OWNER=owner@example.test','EMPTY=']);
 assert.deepEqual(created.Labels,{'traefik.enable':'true'});
 assert.equal(created.HostConfig.Mounts[0].Source,'persistent-data');
 assert.equal(created.HostConfig.PortBindings['80/tcp'][0].HostPort,'8080');
 assert.deepEqual(created.HostConfig.LogConfig,{Type:'local',Config:{'max-size':'10m'}});
 const result=callbacks.filter(c=>c.method==='PATCH'&&c.url==='/api/plugins/docker/containers/').at(-1).body[0];
 assert.equal(result.ContainerID,'replacement');
 assert.equal(result.state,'running');
 assert.deepEqual(result.env,desired.env);
 assert.deepEqual(result.labels,desired.labels);
 assert.deepEqual(result.mounts, [{source:'/data',volume:{name:'persistent-data',host:9},read_only:false}]);
});

for(const running of [true,false])for(const failure of ['network','start']) {
 test(`recreate restores a ${running?'running':'stopped'} original after replacement ${failure} failure`, async t => {
  const {agent,docker,callbacks}=await setup(t);
  const actions=[];
  const original={
   inspect:async()=>({...fixture,State:{...fixture.State,Running:running}}),
   stop:async()=>{actions.push('stop original');},
   rename:async({name})=>{actions.push(name==='demo'?'restore name':'backup name');},
   start:async()=>{actions.push('restart original');},
   remove:async()=>{actions.push('remove original');},
  };
  docker.getContainer=()=>original;
  docker.createContainer=async()=>{
   actions.push('create replacement');
   return {id:'replacement',start:async()=>{
    actions.push('start replacement');
    if(failure==='start')throw Error('replacement start failed');
   },remove:async options=>{assert.equal(options.force,true);actions.push('remove replacement');}};
  };
  docker.getNetwork=()=>({connect:async({Container})=>{
   assert.equal(Container,'replacement');actions.push('connect network');
   if(failure==='network')throw Error('replacement network failed');
  }});
  await assert.rejects(agent.write('PUT','containers',{
   id:7,ContainerID:'abc',name:'demo',operation:'recreate',image:{ImageID:'sha256:upgraded'},
   network_settings:[{network:{name:'primary'}},{network:{name:'secondary'}}],
  }),new RegExp(`replacement ${failure} failed`));
  assert.deepEqual(actions,[
   ...(running?['stop original']:[]),'backup name','create replacement','connect network',
   ...(failure==='start'?['start replacement']:[]),'remove replacement','restore name',
   ...(running?['restart original']:[]),
  ]);
  assert.equal(agent.activeOperations,0);
  assert.equal(callbacks.some(c=>c.method==='PATCH'&&c.url==='/api/plugins/docker/containers/'),false);
  assert.ok(callbacks.some(c=>c.url==='/api/extras/journal-entries/'&&c.body.kind==='danger'&&c.body.comments.includes(`replacement ${failure} failed`)));
 });
}

test('endpoint registration imports the complete inventory through the HTTP route', async t => {
 const {api,agent,callbacks,calls}=await setup(t);
 const response=await api('/api/engine/endpoint');
 assert.equal(response.status,202);
 assert.deepEqual(await response.json(),{});
 await Promise.all(agent.jobs);
 for(const resource of ['hosts','networks','containers','images']) {
  const method=resource==='hosts'?'PATCH':'POST';
  assert.ok(callbacks.some(c=>c.method===method&&c.url===`/api/plugins/docker/${resource}/`),resource);
 }
 assert.ok(calls.some(c=>c.method==='GET'&&c.path==='/volumes'));
});

test('endpoint registration continues other imports when one inventory is rejected', async t => {
 const {api,agent,netbox,callbacks,calls}=await setup(t);
 const resource=netbox.resource.bind(netbox);
 netbox.resource=(method,type,...args)=>method==='POST'&&type==='networks'?Promise.reject(new Error('duplicate network')):resource(method,type,...args);
 assert.equal((await api('/api/engine/endpoint')).status,202);
 await Promise.all(agent.jobs);
 assert.ok(calls.some(c=>c.path==='/volumes'));
 for(const type of ['images','containers'])assert.ok(callbacks.some(c=>c.method==='POST'&&c.url===`/api/plugins/docker/${type}/`));
});

test('prune API returns completed Engine reports and host journals for every resource', async t => {
 const {api,calls,callbacks}=await setup(t);
 for(const resource of ['containers','images','volumes','networks','build-cache']) {
  const options=resource==='build-cache'?{all:true,keep_storage:1024,filters:{until:['24h']}}:resource==='volumes'?{all:true,filters:{label:['cleanup=true']}}:{filters:{label:['cleanup=true'],until:['24h']}};
  const response=await api(`/api/engine/${resource}/prune`,'POST',resource==='images'?options:{data:options});
  assert.equal(response.status,200,resource);
  const report=await response.json();assert.equal(report.SpaceReclaimed,resource==='networks'?undefined:4096);
  const call=calls.find(c=>c.path===`/${resource==='build-cache'?'build':resource}/prune`);
  assert.equal(call.method,'POST');const query=new URLSearchParams(call.query);const filters=JSON.parse(query.get('filters'));
  if(resource==='images')assert.deepEqual(filters.dangling,['true']);
  if(resource==='volumes')assert.deepEqual(filters.all,['true']);
  if(resource==='build-cache'){assert.equal(query.get('all'),'true');assert.equal(query.get('keep-storage'),'1024');assert.deepEqual(filters.until,['24h']);}
  assert.ok(callbacks.some(c=>c.url==='/api/extras/journal-entries/'&&c.body.assigned_object_id===9&&c.body.kind==='success'&&c.body.comments.includes(`pruned ${resource}:`)));
 }
});

test('image prune refreshes and persists registry images without contacting manager inventory', async t => {
 const { api, store, docker, netbox } = await setup(t);
 store.registries = [
  { id: 12, name: 'private.test', serveraddress: 'https://private.test/v2/', images: ['private.test/app:old', 'private.test/app:keep'] },
  { name: 'dockerhub', images: ['unused:latest'] },
 ];
 netbox.resource = async () => { throw Error('manager inventory unavailable'); };
 docker.listImages = async () => [{ RepoTags: ['private.test/app:keep', 'private.test/app:alias'] }];
 const response = await api('/api/engine/images/prune', 'POST', { all: true });
 assert.equal(response.status, 200);
 const registries = await (await api('/api/registries')).json();
 assert.deepEqual(registries, [{ id: 12, name: 'private.test', serveraddress: 'https://private.test/v2/', images: ['private.test/app:alias', 'private.test/app:keep'] }]);
 assert.deepEqual((await new Store(store.directory).load()).registries, registries);
 docker.listImages = async () => [];
 assert.equal((await api('/api/engine/images/prune', 'POST', { all: true })).status, 200);
 assert.deepEqual(await (await api('/api/registries')).json(), []);
 assert.deepEqual((await new Store(store.directory).load()).registries, []);
});

test('prune enforces authentication, origin, POST-only methods and strict input before Engine access', async t => {
 const {api,base,calls}=await setup(t);const route='/api/engine/volumes/prune';
 assert.equal((await fetch(base+route,{method:'POST'})).status,401);
 assert.equal((await api(route,'POST',{}, {authorization:'Basic YmFkOmJhZA=='})).status,401);
 assert.equal((await api(route,'POST',{}, {origin:'https://attacker.example'})).status,403);
 assert.equal((await api(route,'POST',{}, {'sec-fetch-site':'cross-site'})).status,403);
 for(const method of ['GET','HEAD','DELETE','PUT']){const r=await api(route,method);assert.equal(r.status,405);assert.equal(r.headers.get('allow'),'POST');}
 for(const data of [{all:'true'},{filters:{all:['true']}},{filters:{until:['24h']}},{data:null},{data:[],all:true},{typo:true}])assert.equal((await api(route,'POST',data)).status,400);
 assert.equal((await api('/api/engine/registries/prune','POST',{})).status,404);
 assert.equal((await fetch(base+route,{method:'POST',headers:{authorization:auth},body:'{bad'})).status,400);
 assert.equal((await api(route,'POST',{filters:{label:['x'.repeat(1024*1024)]}})).status,413);
 assert.equal(calls.filter(c=>c.path.endsWith('/prune')).length,0);
});

test('background image events do not block build-cache pruning', async t => {
 const { api, agent, docker, getEvents } = await setup(t);
 let release, entered;
 const pending = new Promise(resolve => { release = resolve; });
 const ready = new Promise(resolve => { entered = resolve; });
 docker.listImages = async () => { entered(); await pending; return []; };
 await agent.watch();
 getEvents().write(JSON.stringify({ Type: 'image', Action: 'delete', Actor: { ID: 'removed-image' } }) + '\n');
 await ready;
 try {
  assert.equal(agent.jobs.size, 1);
  const response = await api('/api/engine/build-cache/prune', 'POST', {});
  assert.equal(response.status, 200);
  assert.equal(agent.jobs.size, 1, 'the background refresh should still be tracked');
 } finally {
  release(); await Promise.all(agent.jobs);
 }
 assert.equal(agent.jobs.size, 0);
});

test('prune excludes concurrent prunes and agent mutations, and releases its lock after completion', async t => {
 const {api,agent,docker}=await setup(t);let finish,entered;
 const ready=new Promise(resolve=>{entered=resolve;});const dial=docker.modem.dial.bind(docker.modem);
 docker.modem.dial=(options,callback)=>options.path.includes('/prune')?(finish=callback,entered()):dial(options,callback);
 const first=api('/api/engine/containers/prune','POST',{});await ready;
 try {
  assert.equal((await api('/api/engine/images/prune','POST',{})).status,409);
  assert.equal((await api('/api/engine/containers','POST',{data:{name:'blocked'}})).status,409);
  assert.equal((await api('/api/containers')).status,200);
 } finally {finish(null,{ContainersDeleted:[],SpaceReclaimed:0});assert.equal((await first).status,200);}
 assert.equal(agent.pruning,false);assert.equal(agent.jobs.size,0);
 docker.modem.dial=dial;
 assert.equal((await api('/api/engine/images/prune','POST',{})).status,200);
 let release;const pending=new Promise(resolve=>{release=resolve;});const job=agent.enqueue('busy',()=>pending);
 try{assert.equal((await api('/api/engine/images/prune','POST',{})).status,409);}finally{release();await job;}
});

test('prune excludes an active container operation even when it is not queued as a job', async t => {
 const {agent,docker,calls}=await setup(t);let release,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const pending=new Promise(resolve=>{release=resolve;});
 const get=docker.getContainer.bind(docker);
 docker.getContainer=id=>{const container=get(id);container.start=async()=>{entered();await pending;};return container;};
 const operation=agent.write('PUT','containers',{id:7,ContainerID:'abc',operation:'start'});
 await started;
 try {
  assert.equal(agent.jobs.size,0);assert.equal(agent.activeOperations,1);
  await assert.rejects(agent.prune('containers'),{statusCode:409});
  assert.equal(calls.some(call=>call.path.endsWith('/prune')),false);
 } finally {release();await operation;}
 assert.equal(agent.activeOperations,0);
 assert.equal((await agent.prune('containers')).SpaceReclaimed,4096);
});

for(const [method,data] of [
 ['POST',{name:'blocked',state:'none',image:{name:'nginx',version:'alpine'}}],
 ['PUT',{ContainerID:'abc',operation:'stop'}],
 ['DELETE',{ContainerID:'abc'}],
]) {
 test(`prune excludes a ${method} mutation whose body began arriving before pruning`, async t => {
  const {api,agent,base,server,docker,calls}=await setup(t);
  let bodyStarted,pruneStarted,finishPrune;
  const receiving=new Promise(resolve=>{bodyStarted=resolve;});
  const pruning=new Promise(resolve=>{pruneStarted=resolve;});
  // Observe body consumption so the interleaving is deterministic, without sleeps.
  server.prependOnceListener('request',request=>{
   const iterator=request[Symbol.asyncIterator].bind(request);
   request[Symbol.asyncIterator]=()=>{bodyStarted();return iterator();};
  });
  const dial=docker.modem.dial.bind(docker.modem);
  docker.modem.dial=(options,callback)=>{
   if(options.path.includes('/prune')){finishPrune=callback;pruneStarted();}
   else dial(options,callback);
  };
  let request;
  const response=new Promise((resolve,reject)=>{
   request=http.request(base+'/api/engine/containers',{method,headers:{authorization:auth,'content-type':'application/json','transfer-encoding':'chunked'}},res=>{
    let text='';res.on('data',chunk=>{text+=chunk;});
    res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
   });
   request.on('error',reject);
  });
  const payload=JSON.stringify({data}),split=Math.floor(payload.length/2);
  request.write(payload.slice(0,split));
  await receiving;
  const prune=api('/api/engine/containers/prune','POST',{});
  await pruning;
  let result;
  try {request.end(payload.slice(split));result=await response;}
  finally {
   finishPrune(null,{ContainersDeleted:[],SpaceReclaimed:0});
   assert.equal((await prune).status,200);
   await Promise.all(agent.jobs);
  }
  assert.equal(result.status,409);
  assert.match(result.body.message,/Prune is in progress/);
  assert.equal(calls.some(call=>['POST','DELETE'].includes(call.method)),false,'blocked mutations must not reach Docker');
  assert.equal(agent.pruning,false);assert.equal(agent.jobs.size,0);
 });
}

test('prune reports Docker failures, journals them and never fails a completed deletion for a callback error', async t => {
 const {api,agent,docker,netbox,callbacks}=await setup(t);const dial=docker.modem.dial.bind(docker.modem);
 docker.modem.dial=(options,callback)=>options.path.includes('/prune')?callback(Object.assign(new Error('engine prune failed'),{statusCode:500})):dial(options,callback);
 const response=await api('/api/engine/images/prune','POST',{});assert.equal(response.status,500);assert.match((await response.json()).message,/engine prune failed/);
 assert.ok(callbacks.some(c=>c.body?.kind==='danger'&&c.body.comments.includes('prune images failed')));
 assert.equal(agent.pruning,false);docker.modem.dial=dial;
 netbox.journal=async()=>{throw Error('manager unavailable');};
 assert.equal((await api('/api/engine/images/prune','POST',{})).status,200);
});


test('info exposes system and agent uptime as seconds even when the Docker engine is unavailable',async t=>{
 const {agent,api,docker}=await setup(t);
 const before=process.uptime(),response=await api('/info'),info=await response.json();
 assert.equal(response.status,200);assert.ok(Number.isFinite(info.uptime.system));assert.ok(info.uptime.system>=0);
 assert.ok(info.uptime.agent>=before);assert.ok(info.uptime.agent<=process.uptime());
 docker.version=async()=>{throw Error('offline');};
 const offline=await agent.info();assert.equal(offline.docker,'error');assert.ok(offline.uptime.system>=info.uptime.system);assert.ok(offline.uptime.agent>=info.uptime.agent);
});


test('Swagger UI assets are local, authenticated and scoped to the documentation page',async t=>{
 const {api}=await setup(t);const doc=await api('/doc');const html=await doc.text();
 assert.ok(html.includes('/vendor/swagger-ui-bundle.js'));assert.ok(html.includes('id="swagger-ui"'));assert.ok(!html.includes('https://'));
 const csp=doc.headers.get('content-security-policy');assert.ok(csp.includes("script-src 'self';"));assert.ok(csp.includes("style-src-attr 'unsafe-inline'"));
 const dashboard=await api('/');assert.ok(!dashboard.headers.get('content-security-policy').includes('unsafe-inline'));
 for(const path of ['/vendor/swagger-ui-bundle.js','/vendor/swagger-ui.css','/doc.css'])assert.equal((await api(path,'GET',undefined,{authorization:''})).status,401);
 const spec=await(await api('/openapi.json')).json();assert.equal(spec.paths['/api/engine/containers/{containerId}/logs'].put,undefined);
 assert.ok(spec.paths['/api/engine/containers/{containerId}/logs'].get);
 for(const resource of ['containers','images','networks','volumes'])assert.ok(spec.paths[`/api/engine/${resource}`].delete.requestBody);
 assert.deepEqual(spec.paths['/admin/config'].patch.security,[{basicAuth:[]}]);
});


test('metrics HTTP responses keep container series stable when only elapsed time changes',async t=>{
 const {api,docker}=await setup(t);const container={State:'running',Names:['/stable-metrics'],Status:'Up 10 seconds (unhealthy)'};
 docker.listContainers=async()=>[container];const first=await(await api('/metrics')).text();
 container.Status='Up 6 hours (unhealthy)';const later=await(await api('/metrics')).text();
 assert.equal(later,first);assert.match(later,/state="running", status="running \(unhealthy\)"/);
 assert.ok(!later.includes('10 seconds'));assert.ok(!later.includes('6 hours'));
});
