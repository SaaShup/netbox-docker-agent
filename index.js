const http = require('http');
const express = require("express");
const RED = require("node-red");
const app = express();
const settings = require("./settings.js")

console.log(settings)

const server = http.createServer(app);

RED.init(server,settings);
app.use(settings.httpAdminRoot,RED.httpAdmin);
app.use(settings.httpNodeRoot,RED.httpNode);
server.listen(process.env.PORT || 1880);
RED.start();
