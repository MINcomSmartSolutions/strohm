require('dotenv').config();
/**
 * Starts the server and listens on the specified port.
 * @function
 * @name startServer
 * @param {number} port - The port number to listen on.
 * @returns {void}
 */
const port = 3000;
const app = require('./src/app');

app.listen(port, () => console.log(`server listening on port ${port}`));

