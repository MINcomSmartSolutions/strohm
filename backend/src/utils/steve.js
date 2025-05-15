/**
 * @file Utility functions for Steve user data.
 *
 * @exports validateSteveUser: Validates the structure and idTag of a Steve user response.
 * @module utils/steve
 */

const {ValidationError, ErrorCodes} = require('./errors');
const {steveUserSchema} = require('./joi');

/**
 * Validates Steve user response data.
 * - Checks structure using Joi schema.
 * - Ensures idTag matches the expected RFID.
 *
 * @param {Object} response_data - Steve user response object.
 * @param {string} userRfid - Expected RFID tag.
 * @throws {ValidationError} If validation fails.
 */
const validateSteveUser = (response_data, userRfid) => {
    // Validate response structure using Joi
    const {error} = steveUserSchema.validate(response_data);

    if (error) {
        const errorMessage = error.details[0].message;
        const errorType = error.details[0].type;

        if (errorType.includes('required')) {
            throw new ValidationError(ErrorCodes.VALIDATION.MISSING_PARAMETERS, errorMessage);
        } else if (errorType.includes('valid')) {
            throw new ValidationError(ErrorCodes.VALIDATION.INVALID_PARAMETERS, errorMessage);
        } else {
            throw new ValidationError(ErrorCodes.VALIDATION.INVALID_FORMAT, errorMessage);
        }
    }

    // Check if idTag matches the expected RFID
    if (response_data.idTag !== userRfid) {
        throw new ValidationError(
            ErrorCodes.VALIDATION.GIVEN_RETURN_DISCREPANCY,
            `ID tag mismatch. Expected "${userRfid}", but got "${response_data.idTag}".`,
        );
    }
};

module.exports = {
    validateSteveUser,
};