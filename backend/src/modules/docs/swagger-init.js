/* global window */
window.addEventListener('DOMContentLoaded', () => {
  window.SwaggerUIBundle({
    url: '../openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    displayRequestDuration: true,
    filter: true,
    persistAuthorization: false,
    queryConfigEnabled: false,
    validatorUrl: null,
    supportedSubmitMethods: ['get', 'post'],
  });
});
