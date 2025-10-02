const swaggerJSDoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0', // Specify the OpenAPI version
        info: {
            title: 'API Documentation',
            version: '0.5.0',
            description: 'API documentation',
        }, components: {
            securitySchemes: {
                Authorization: {
                    type: 'apiKey',
                    scheme: 'bearer',
                    name: 'Authorization',
                    value: 'JWT <JWT token here>',
                    in: 'header',
                },
            },
        },
    }, // Specify the files where your API endpoints are defined
    apis: ['./src/controllers/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
