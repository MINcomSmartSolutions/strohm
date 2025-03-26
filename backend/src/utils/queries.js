const argon2 = require('argon2');
const { DateTime } = require('luxon');
const logger = require('./logger');
const pool = require('./db_conn');
const { DatabaseError, ErrorCodes } = require('./errors');


/**
 * Handles query errors.
 *
 * @param {Error} error - The error object.
 * @param {string} operation - The operation being performed.
 * @throws {Error} - The error that happened during the operation.
 */

const handleQueryError = (error, operation) => {
	logger.error(`Error during ${operation} operation:`, error);
	throw new DatabaseError(
			ErrorCodes.DATABASE.QUERY_ERROR,
			`Error during ${operation} operation.`,
			error
	);
};

