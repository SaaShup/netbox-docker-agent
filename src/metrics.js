const escape = value => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
export async function metrics(agent) {
  let containers = [], up = 1;
  try { containers = await agent.docker.listContainers({ all: true }); } catch { up = 0; }
  let output = '';
  for (const state of ['running', 'exited', 'stopped']) {
    const name = `netbox_docker_agent_container_${state}`;
    output += `# HELP ${name} Show if a container is ${state === 'running' ? 'running' : 'exited'}\n# TYPE ${name} gauge\n`;
    for (const c of containers.filter(c => c.State === state)) {
      const health = /\((healthy|unhealthy|health: starting)\)/.exec(c.Status || '');
      const status = c.State + (health ? ` ${health[0]}` : '');
      output += `${name}{name="${escape(c.Names?.[0] || '')}", state="${escape(c.State)}"${state === 'exited' ? '' : `, status="${escape(status)}"`}} 1\n`;
    }
    output += '\n';
  }
  return output + `# HELP netbox_docker_agent_docker_daemon Show if the connection to the daemon is working\n# TYPE netbox_docker_agent_docker_daemon gauge\nnetbox_docker_agent_docker_daemon{socket="/var/run/docker.socket"} ${up}\n\n# HELP netbox_docker_agent_netbox_error_response Show the netbox error response counter\n# TYPE netbox_docker_agent_netbox_error_response counter\nnetbox_docker_agent_netbox_error_response{} ${agent.netbox.errors}\n`;
}
