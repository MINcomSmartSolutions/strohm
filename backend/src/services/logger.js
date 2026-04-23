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
const {GLOBAL_CONFIG} = require("#config");


const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'silly',
    levels: winston.config.npm.levels,
    format: format.combine(
        format.timestamp(),
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
            level: process.env.LOG_LEVEL || 'silly',
            maxFiles: '14d',
            zippedArchive: true,
        }),
    ],
});

/**
 * Safely stringify objects with circular references
 * @param {Object} obj - Object to stringify
 * @returns {string} JSON string or empty string if no metadata
 */
function safeStringify(obj) {
    if (!obj || Object.keys(obj).length === 0) {
        return '';
    }

    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
        }
        return value;
    }, 2);
}

// Use JSON format in production, pretty format in development
const consoleFormat = GLOBAL_CONFIG.ENV.IS_PRODUCTION
    ? format.combine(
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss,SSS'}),
        format.errors({stack: true}),
        format.json()
    )
    : format.combine(
        format.colorize(),
        format.timestamp({format: 'YYYY-MM-DD HH:mm:ss,SSS'}),
        format.printf(({timestamp, level, message, stack, file, line, label, ...meta}) => {
            const logStack = stack ? `\n${stack}` : '';
            let metaStr = Object.keys(meta).length ? safeStringify(meta) : '';
            return `[${timestamp}] ${level} ${file ? `[${file}:${line}]` : ''}: ${message} ${metaStr} ${logStack}`.trim();
        }),
        format.errors({stack: true}),
    );

logger.add(new winston.transports.Console({
    format: consoleFormat,
}));

const morganMiddleware = morgan(
    ':method :url :status :res[content-length] - :response-time ms - :remote-addr',
    {
        stream: {
            write: (message) => logger.http(message.trim()),
        },
    },
);

/**
 * Creates a child logger with session context that automatically prefixes all log messages
 * with the session ID. This eliminates the need to manually add [sessionId] to every log.
 *
 * @param {string|Object} sessionId - The session ID or request object to extract session from
 * @returns {Object} A logger instance with all standard methods (info, debug, warn, error, etc.)
 *
 */
logger.withSession = function (sessionId) {
    // If passed a request object, extract sessionID
    if (sessionId && typeof sessionId === 'object' && sessionId.sessionID) {
        sessionId = sessionId.sessionID;
    }

    const sid = sessionId || 'no-session';

    // Create a child logger with session context
    return logger.child({sessionId: sid}, {
        // Custom format to prepend session ID to message
        format: format.combine(
            format.printf((info) => {
                // Prepend [sessionId] to the message
                if (info.message && info.sessionId) {
                    info.message = `[${info.sessionId}] ${info.message}`;
                }
                return info;
            })
        )
    });
};

/**
 * Pretty-print a value for logs (safe for circular refs)
 * @param {*} value
 * @returns {string}
 */
function prettyPrint(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;

    try {
        return safeStringify(value);
    } catch (err) {
        return `[Unserializable: ${err.message}]`;
    }
}


module.exports = logger;
module.exports.morganMiddleware = morganMiddleware;
module.exports.prettyPrint = prettyPrint;
