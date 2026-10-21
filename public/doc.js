/* global SwaggerUIBundle */
window.ui = SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  filter: true,
  docExpansion: 'list',
  defaultModelsExpandDepth: 0,
  displayRequestDuration: true,
  persistAuthorization: false,
  validatorUrl: null,
  queryConfigEnabled: false,
  supportedSubmitMethods: ['get', 'post', 'put', 'patch', 'delete', 'head'],
  requestInterceptor(request) {
    if (new URL(request.url, location.href).origin !== location.origin) throw Error('API requests must target this agent');
    request.credentials = 'same-origin';
    return request;
  },
});
