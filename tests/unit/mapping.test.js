import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerRecord, createOptions, imageRecord } from '../../src/mapping.js';
import { usage, demux } from '../../src/docker.js';
import { metrics } from '../../src/metrics.js';
const c = { Id:'abc',Name:'/demo',Image:'sha256:image',Config:{Hostname:'host',Env:['A=x=y','EMPTY='],Labels:{'a"':'<script>'},Cmd:['sh']},State:{Status:'exited',ExitCode:3},HostConfig:{CapAdd:['CAP_NET_ADMIN'],RestartPolicy:{Name:''},PortBindings:{'80/tcp':[{HostPort:'8080'}]},LogConfig:{Type:'local',Config:{'max-size':'10m'}},Devices:[{PathInContainer:'/dev/a',PathOnHost:'/dev/b'}],Sysctls:{'net.ipv4.ip_forward':'1'}},NetworkSettings:{Networks:{bridge:{}}},Mounts:[{Type:'volume',Name:'data',Destination:'/data',RW:false},{Type:'bind',Source:'/host',Destination:'/mount',RW:true}] };
test('inspection mapping preserves nested plugin fields and values',()=>{
 const r=containerRecord(c,5,7);assert.equal(r.id,7);assert.equal(r.host,5);assert.equal(r.name,'demo');assert.equal(r.env[0].value,'x=y');assert.equal(r.env[1].value,'');assert.deepEqual(r.cap_add,['NET_ADMIN']);assert.equal(r.restart_policy,'no');assert.deepEqual(r.ports,[{public_port:'8080',private_port:'80',type:'tcp'}]);assert.equal(r.mounts[0].read_only,true);assert.equal(r.binds[0].read_only,false);assert.equal(r.devices[0].host_path,'/dev/b');assert.equal(r.log_driver_options[0].option_name,'max-size');assert.deepEqual(r.sysctls,[{key:'net.ipv4.ip_forward',value:'1'}]);assert.equal(r.image.ImageID,'sha256:image');assert.equal(r.exitCode,3);
});
test('recreation maps complete writable configuration without shell interpolation',()=>{
 const d={...containerRecord(c,5),image:{ImageID:'sha256:image'},hostname:"host'$(touch /tmp/injected)",ports:[{private_port:80,public_port:8080,type:'tcp'},{private_port:81,public_port:-1,type:'udp'}],network_settings:[{network:{name:'host',driver:'host'}}],secOpt:['no-new-privileges'],pid_mode:'host',extra_hosts:['x:1.2.3.4']};
 const o=createOptions(d,true);assert.equal(o.Hostname,d.hostname);assert.equal(o.Image,'sha256:image');assert.deepEqual(o.Env,['A=x=y','EMPTY=']);assert.equal(o.HostConfig.NetworkMode,'host');assert.equal(o.HostConfig.Mounts.length,2);assert.equal(o.HostConfig.Mounts[0].ReadOnly,true);assert.equal(o.HostConfig.Devices[0].CgroupPermissions,'rwm');assert.deepEqual(o.ExposedPorts,{'80/tcp':{}});assert.deepEqual(o.HostConfig.PortBindings['80/tcp'],[{HostIp:'',HostPort:'8080'}]);assert.deepEqual(o.HostConfig.SecurityOpt,d.secOpt);assert.deepEqual(o.HostConfig.Sysctls,{'net.ipv4.ip_forward':'1'});
});
test('image mapping handles registry ports, digests and untagged images',()=>{
 const r=imageRecord({RepoTags:['localhost:5000/ns/app:v1'],RepoDigests:['localhost:5000/ns/app@sha256:abc'],Id:'sha256:x',Size:1048576},1,[{id:9,images:['localhost:5000/ns/app:v1']}]);assert.equal(r.name,'localhost:5000/ns/app');assert.equal(r.version,'v1');assert.equal(r.Digest,'sha256:abc');assert.equal(r.registry.id,9);assert.equal(r.size,1);
 assert.equal(imageRecord({Id:'sha256:x',Size:1},1).version,'<none>');
 assert.equal(imageRecord({RepoDigests:['repo@sha256:abc'],Id:'sha256:x',Size:1},1).version,'sha256:abc');
});
test('disk usage aggregates null arrays and all size fields',()=>{assert.deepEqual(usage({Images:[{Size:5,SharedSize:2,VirtualSize:7}],Containers:[{SizeRootFs:3}],Volumes:[{UsageData:{Size:4}}],BuildCache:[{Size:8}],LayersSize:9}),{layers_size:9,images:{size:5,shared_size:2,virtual_size:7},containers:{size_rootfs:3},volumes:4,build_cache:8});assert.equal(usage({}).images.size,0);});
test('Docker stream demultiplexing preserves plain TTY and decodes every frame',()=>{const data=Buffer.from('hello');const h=Buffer.alloc(8);h[0]=1;h.writeUInt32BE(data.length,4);assert.equal(demux(Buffer.concat([h,data,h,data])).toString(),'hellohello');assert.equal(demux(data).toString(),'hello');});
test('Prometheus escapes labels and exposes all five metric families on daemon failure',async()=>{const a={docker:{listContainers:async()=>[{State:'running',Names:['/a"\\\nb'],Status:'Up'}]},netbox:{errors:4}};const result=await metrics(a);assert.match(result,/name="\/a\\"\\\\\\nb"/);assert.equal((result.match(/# TYPE /g)||[]).length,5);a.docker.listContainers=async()=>{throw Error('offline')};assert.match(await metrics(a),/socket="\/var\/run\/docker.socket"} 0/);});


test('Prometheus status labels remain identical as containers age and retain health changes',async()=>{
 const container={State:'running',Names:['/stable'],Status:''};
 const agent={docker:{listContainers:async()=>[container]},netbox:{errors:0}};
 for(const health of ['', ' (healthy)', ' (unhealthy)', ' (health: starting)']) {
  container.Status='Up 2 seconds'+health;const first=await metrics(agent);
  container.Status='Up 3 days'+health;const later=await metrics(agent);
  assert.equal(later,first);assert.ok(later.includes(`status="running${health}"`));assert.ok(!later.includes('Up '));
 }
 container.Status='Up 5 minutes (unhealthy)';const unhealthy=await metrics(agent);
 container.Status='Up 5 minutes (healthy)';assert.notEqual(await metrics(agent),unhealthy);
});
