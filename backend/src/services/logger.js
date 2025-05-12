/**
 * Creates a logger instance with specified configuration.
 * @type {winston}
 */
const winston = require('winston');


//TODO: Add the file/function where the logger is used
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.label({label: process.env.NODE_ENV}),
        winston.format.timestamp(), winston.format.errors({stack: true}),
        winston.format.splat(), winston.format.json()),

    transports: [
        new winston.transports.File({filename: 'logs/error.log', level: 'error'}),
        new winston.transports.File({
            filename: 'logs/combined.log',
            level: process.env.LOG_LEVEL || 'info',
        }),
    ],
});


// If we're not in production then log to the `console` with the format:
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({format: winston.format.simple()}));
}

module.exports = logger;