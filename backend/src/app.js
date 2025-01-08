/**
 * Express app instance.
 * @module app
 */
const express = require('express');
const app = express();
const cors = require('cors');
const hpp = require('hpp');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swaggerConfig');

app.set('trust proxy', 1 /* number of proxies between user and server */);

app.use(express.urlencoded({extended: true}));
app.use(express.json());


app.use(hpp());
app.use(helmet());


module.exports = app;