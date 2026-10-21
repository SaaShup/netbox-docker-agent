// Run after the harness restarts dind. The subsequent events.hurl verifies
// an out-of-band event reaches NetBox after reconnection, without inspecting
// the agent's implementation or OS processes.
const auth = 'Basic ' + Buffer.from(`${process.env.WS_USER || 'admin'}:${process.env.WS_PASS || 'saashup'}`).toString('base64');
let ready = false;
for (let i=0;i<30;i++) {
  try { const res=await fetch('http://localhost:1880/info',{headers:{authorization:auth}});const info=await res.json();if(info.docker?.Version){ready=true;break;} } catch {}
  await new Promise(r=>setTimeout(r,1000));
}
if(!ready)throw Error('Agent did not recover its Docker connection after daemon restart');
console.log('docker-event: daemon connection recovered; events.hurl checks subsequent callbacks');
