const request = require('supertest');

const protocol = process.env.PROTO || 'http';
const host = process.env.HOST || 'localhost';
const port = process.env.PORT || '1880';
const user = process.env.USER || "admin";
const password = process.env.PASSWORD || "saashup";

const app = `${protocol}://${host}:${port}`;

describe('Health check testing', () => {
    test('that the health check works', async () => {
        const response = await request(app).get('/info').auth(user, password);

        expect(response.statusCode).toEqual(200);
        expect(response.body.message).toEqual("netbox-saashup-agent");
    });
  });
