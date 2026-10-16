// Authenticated registry pull, daemon auth forwarding and registry association.
import { dockerClient } from '/app/src/docker.js';
import bcrypt from '/app/node_modules/bcryptjs/index.js';
import { Readable } from 'node:stream';
const docker=dockerClient(), auth='Basic '+Buffer.from('admin:saashup').toString('base64');
const ref='localhost:5000/parity/nginx:v1', name='compat-private-registry';
const credentials={username:'parity',password:'registry-test-only',serveraddress:'localhost:5000'};
const follow=stream=>new Promise((resolve,reject)=>docker.modem.followProgress(stream,(e,output)=>{const failed=output?.find(x=>x.error);e||failed?reject(e||Error(failed.error)):resolve()}));
try{
 await docker.getContainer(name).remove({force:true}).catch(()=>{});
 await follow(await docker.pull('registry:2'));
 const passwordHash=await bcrypt.hash(credentials.password,4);
 const registry=await docker.createContainer({name,Image:'registry:2',Entrypoint:['/bin/sh','-c'],Cmd:['printf "%s\\n" "$TEST_HTPASSWD" > /tmp/htpasswd; exec /entrypoint.sh /etc/docker/registry/config.yml'],Env:[`TEST_HTPASSWD=parity:${passwordHash}`,'REGISTRY_AUTH=htpasswd','REGISTRY_AUTH_HTPASSWD_REALM=parity','REGISTRY_AUTH_HTPASSWD_PATH=/tmp/htpasswd'],ExposedPorts:{'5000/tcp':{}},HostConfig:{PortBindings:{'5000/tcp':[{HostPort:'5000'}]}}});
 await registry.start();
 let ready=false;for(let i=0;i<30;i++){try{const r=await fetch('http://dind:5000/v2/');if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Authenticated registry did not start');
 // Import a tiny root filesystem so push coverage is independent of upstream
 // multi-platform manifests and Docker's partial platform image cache.
 const content=Buffer.from('registry parity fixture\n'),header=Buffer.alloc(512);
 header.write('marker');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
 header.write(content.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=48;
 header.write('ustar\0',257);header.write('00',263);header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
 const archive=Buffer.concat([header,content,Buffer.alloc(512-content.length),Buffer.alloc(1024)]);
 await follow(await docker.importImage(Readable.from([archive]),{repo:'localhost:5000/parity/nginx',tag:'v1'}));
 await follow(await docker.getImage(ref).push({authconfig:credentials}));
 await docker.getImage(ref).remove();
 const res=await fetch('http://localhost:1880/api/engine/images',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({data:{id:808,name:'localhost:5000/parity/nginx',version:'v1',size:0,ImageID:null,display:ref,registry:{id:808,name:'parity-registry',...credentials}}})});
 if(res.status!==202)throw Error('Registry image pull did not acknowledge');
 let pulled=false;for(let i=0;i<60;i++){const images=await(await fetch('http://localhost:1880/api/images',{headers:{authorization:auth}})).json();if(images.some(i=>i.RepoTags?.includes(ref))){pulled=true;break;}await new Promise(r=>setTimeout(r,500));}if(!pulled)throw Error('Agent did not pull from authenticated registry');
 let mapped=false;for(let i=0;i<20;i++){const regs=await(await fetch('http://localhost:1880/api/registries',{headers:{authorization:auth}})).json();if(regs.some(r=>r.id===808&&r.images.includes(ref))){mapped=true;break;}await new Promise(r=>setTimeout(r,100));}if(!mapped)throw Error('Registry/image association was not retained');
 console.log('registry: PASS — authenticated push/pull and registry association');
}finally{await docker.getImage(ref).remove().catch(()=>{});await docker.getContainer(name).remove({force:true}).catch(()=>{});}
