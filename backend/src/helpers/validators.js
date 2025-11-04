function isValidInteger(value) {
    return typeof value === 'number' &&
        Number.isInteger(value) &&
        !Number.isNaN(value);
}

function isValidNumber(value) {
    return typeof value === 'number' &&
        !Number.isNaN(value) &&
        isFinite(value);
}

function isNullOrUndefined(value) {
    return value === null || value === undefined;
}

module.exports = {
    isValidNumber,
    isValidInteger,
};