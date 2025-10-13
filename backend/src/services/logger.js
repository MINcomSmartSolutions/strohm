/**
 * @file Logger service using winston with file rotation and enhanced console output
 *
 * @type {winston}
 * @module services/logger
 */
const winston = require('winston');
const {format} = winston;
const DailyRotateFile = require('winston-daily-rotate-file');
const morgan = require('morgan');


const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'silly',
    levels: winston.config.npm.levels,
    format: format.combine(
        format.timestamp(),
        format.label({label: process.env.NODE_ENV}),
        format.errors({stack: true}),
        format.splat(),
        format.json(),
    ),
    transports: [
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '14d',
            zippedArchive: true,
        }),
        new DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: process.env.LOG_LEVEL || 'info',
            maxFiles: '14d',
            zippedArchive: true,
        }),
    ],
});

logger.add(new winston.transports.Console({
    format: format.combine(
        format.colorize(),
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss,SSS'}),
        format.printf(({timestamp, level, message, stack, file, line, label, ...meta}) => {
            const logStack = stack ? `\n${stack}` : '';
            let metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            let envLabel = label ? `[${label.toUpperCase()}]` : '';
            return `${envLabel} [${timestamp}] ${level} ${file ? `[${file}:${line}]` : ''}: ${message} ${metaStr} ${logStack}`.trim();
        }),
        format.errors({stack: true}),
    ),
}));

const morganMiddleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms - :remote-addr',
    {
        stream: {
            write: (message) => logger.http(message.trim()),
        },
    },
);


module.exports = logger;
module.exports.morganMiddleware = morganMiddleware;