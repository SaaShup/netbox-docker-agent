const inc = require("./inc.js");

const pathinfo = "/doc"
describe('api ' + pathinfo, () => {
    let method = "get"
    test(method + ' ' + pathinfo, async () => {
        const response = await inc.request(inc.app).get(pathinfo).auth(inc.user, inc.password);
        expect(response.statusCode).toEqual(parseInt(Object.keys(inc.openapi["paths"][pathinfo][method]["responses"])[0]));
        let content = inc.openapi["paths"][pathinfo][method]["responses"][response.statusCode]["content"]["text/html; charset=utf-8"]
        if ('examples' in content) {
            let res = content["examples"][pathinfo].value
            for (let i in res) {
                expect(response.body[i]).toEqual(res[i]);
            }
        }
    });
  });
