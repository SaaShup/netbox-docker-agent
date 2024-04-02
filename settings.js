data = require("./package.json")

module.exports = {
    credentialSecret: "saashup",
    flowFile: "flows.json",
    flowFilePretty: true,
    adminAuth: {
        type: "credentials",
        users: [{
            username: process.env.USERNAME || "admin",
            password: process.env.PASSWORD || "$2a$08$s.NFdSn4Gm4d7gHErya//e6O8RO1/3f7TZ7zflXJ9jfFV0cI6jGwK",
            permissions: "*"
        }]
    },
    /*https: {
      key: require("fs").readFileSync('/data/privkey.pem'),
      cert: require("fs").readFileSync('/data/cert.pem')
    },
    requireHttps: true,*/
    httpNodeAuth: {
        user: process.env.USERNAME || "admin",
        pass: process.env.PASSWORD || "$2a$08$s.NFdSn4Gm4d7gHErya//e6O8RO1/3f7TZ7zflXJ9jfFV0cI6jGwK"
    },
    uiPort: process.env.PORT || 1880,
    httpStatic: [
        { path: '/usr/src/node-red/public', root: '/' },
        { path: '/usr/src/node-red/public/doc.html', root: '/doc' },
        { path: '/usr/src/node-red/public/openapi.yml', root: '/openapi' }
    ],
    httpAdminRoot: '/nodered',
    diagnostics: {
        enabled: true,
        ui: true,
    },
    runtimeState: {
        enabled: false,
        ui: false,
    },
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false,
            handler: function(settings) {
                return function(msg) {
                    const level = {
                        20: 'error',
                        30: 'warn',
                        40: 'info'
                    };
                    const lvl = "level" in msg ? msg.level : "40";

                    delete msg.type;
                    delete msg.z;
                    delete msg.path;
                    delete msg.name;
                    delete msg.id;

                    let line = `${data.name} level=${level[lvl]} version=${data.version}`;

                    if (typeof msg.msg === 'object') {
                        for (const key of Object.keys(msg.msg)) {
                            line += ` ${key}=${JSON.stringify(msg.msg[key])}`;
                        }
                    } else {
                        line += ` msg=` + JSON.stringify(msg.msg);
                    }

                    if (lvl <= 20) {
                        return console.error(line);
                    }

                    return console.log(line);
                }
            }
        }
    },
    exportGlobalContextKeys: false,
    externalModules: {
    },
    editorTheme: {
        tours: false,
        palette: {
        },
        projects: {
            enabled: false,
            workflow: {
                mode: "manual"
            }
        },
        codeEditor: {
            lib: "monaco",
            options: {
            }
        },
        markdownEditor: {
            mermaid: {
                enabled: true
            }
        },
    },
    functionExternalModules: true,
    functionTimeout: 0,
    functionGlobalContext: {
    },
    debugMaxLength: 1000,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000
}
