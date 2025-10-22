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

module.exports = {
    clearSession
}