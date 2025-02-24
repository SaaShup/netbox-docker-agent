const DockerExecWebsocketServer = require("docker-exec-websocket-server");
const red = require("node-red");

module.exports = {
    create: (containerId) => {
        const path = `/ws/engine/containers/${containerId}/exec`;

        return new DockerExecWebsocketServer.DockerExecServer({
            path: path,
            containerId: containerId,
            server: red.server
        });
    }
}
