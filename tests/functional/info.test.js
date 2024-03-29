const inc = require("./inc.js");

const pathinfo = "/info"
describe('api ' + pathinfo, () => {
    let method = "get"
    test(method + ' ' + pathinfo, async () => {
        const response = await inc.request(inc.app).get(pathinfo).auth(inc.user, inc.password);
        let res = inc.openapi["paths"][pathinfo][method]["responses"][response.statusCode]["content"]["application/json; charset=utf-8"]["examples"][pathinfo].value
        expect(response.statusCode).toEqual(parseInt(Object.keys(inc.openapi["paths"][pathinfo][method]["responses"])[0]));
        for (let i in res) {
            expect(response.body[i]).toEqual(res[i]);
        }
    });
  });
