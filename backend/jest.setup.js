/**
 * Jest setup file - runs before all tests
 * Loads environment variables from .env.test
 */
const path = require('path');
const dotenv = require('dotenv');

// Load test environment variables
const envPath = path.resolve(__dirname, '.env.test');
dotenv.config({path: envPath});

// Log that test environment is loaded (optional, can be removed)
if (process.env.NODE_ENV !== 'test') {
    console.warn('Warning: NODE_ENV is not set to "test"');
}

