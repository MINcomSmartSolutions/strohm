const {ErrorCodes} = require("#utils/errors");

async function clearSession(req) {
    return new Promise((resolve, reject) => {
        if (req && req.session) {
            req.session.destroy((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}


async function saveSession(req) {
    // async to prevent race conditions
    return new Promise((resolve, reject) => {
        if (req && req.session) {
            req.session.save((err) => {
                if (err) {
                    reject(ErrorCodes.SYSTEM.SESSION_SAVE_FAILED, null, err);
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

module.exports = {
    clearSession,
    saveSession,
}