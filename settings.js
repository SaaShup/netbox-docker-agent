module.exports = {
    credentialSecret: "saashup",
    flowFilePretty: true,
    adminAuth: {
        type: "credentials",
        users: [{
            username: "admin",
            password: "$2a$08$s.NFdSn4Gm4d7gHErya//e6O8RO1/3f7TZ7zflXJ9jfFV0cI6jGwK",
            permissions: "*"
        }]
    },
    /*https: {
      key: require("fs").readFileSync('/data/privkey.pem'),
      cert: require("fs").readFileSync('/data/cert.pem')
    },
    requireHttps: true,*/
    httpNodeAuth: {
        user:"admin",pass:"$2a$08$s.NFdSn4Gm4d7gHErya//e6O8RO1/3f7TZ7zflXJ9jfFV0cI6jGwK"
    },
    uiPort: process.env.PORT || 1880,
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
            audit: false
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
    serialReconnectTime: 15000,
}

