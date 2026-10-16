// Requires the harness to load the production image into dind first.
import { dockerClient } from '/app/src/docker.js';
const docker=dockerClient(), name='compat-self-agent', volume='compat-self-data';
const auth='Basic '+Buffer.from('admin:saashup').toString('base64');
const base='http://dind:1881';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(predicate,message){for(let i=0;i<60;i++){try{if(await predicate())return;}catch{}await sleep(500);}throw Error(message);}
try{
 await docker.getContainer(name).remove({force:true}).catch(()=>{});
 const c=await docker.createContainer({name,Image:'saashup/netbox-docker-agent:compat',User:'0',ExposedPorts:{'1880/tcp':{}},HostConfig:{Binds:['/var/run/docker.sock:/var/run/docker.sock'],Mounts:[{Type:'volume',Source:volume,Target:'/data'}],PortBindings:{'1880/tcp':[{HostPort:'1881'}]}}});
 await c.start();
 await wait(async()=>(await fetch(base+'/info',{headers:{authorization:auth}})).ok,'nested agent did not start');
 const original=await c.inspect();
 const res=await fetch(base+'/api/engine/containers',{method:'PUT',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({data:{ContainerID:original.Id,name,operation:'recreate',image:{ImageID:original.Image},ports:[{private_port:1880,public_port:1881,type:'tcp'}],binds:[{host_path:'/var/run/docker.sock',container_path:'/var/run/docker.sock',read_only:false}],mounts:[{source:'/data',volume:{name:volume},read_only:false}],restart_policy:'no'}})});
 if(res.status!==403)throw Error(`self recreation returned ${res.status}, expected 403`);
 const message=await res.json();
 if(!message.message.includes('cannot recreate its own container'))throw Error('missing self-recreation explanation');
 const current=await docker.getContainer(name).inspect();
 if(current.Id!==original.Id||!current.State.Running||current.RestartCount!==original.RestartCount)throw Error('self recreation changed the running agent');
 const result=await fetch(base+'/info',{headers:{authorization:auth}});
 if(!result.ok)throw Error('original agent API did not remain available');
 console.log('self-recreate: PASS — rejected with 403 and original agent stayed running');
}finally{await docker.getContainer(name).remove({force:true}).catch(()=>{});await docker.getVolume(volume).remove().catch(()=>{});}
