const request = require('supertest');
const openapi = require('../../public/openapi.json')

const protocol = process.env.PROTO || 'http';
const host = process.env.HOST || 'localhost';
const port = process.env.PORT || '1880';
const user = process.env.USER || "admin";
const password = process.env.PASSWORD || "saashup";
const app = `${protocol}://${host}:${port}`;

module.exports = {
    request: request,
    openapi: openapi,
    app: app,
    user: user,
    password: password
}