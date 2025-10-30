const {clearSession, saveSession} = require('#utils/session');
const {ErrorCodes} = require('#utils/errors');

describe('Session Utilities', () => {
    describe('clearSession', () => {
        it('should successfully clear a valid session', async () => {
            const mockReq = {
                session: {
                    destroy: jest.fn((callback) => callback(null)),
                },
            };

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.destroy).toHaveBeenCalledTimes(1);
        });

        it('should reject when session.destroy fails', async () => {
            const mockError = new Error('Destroy failed');
            const mockReq = {
                session: {
                    destroy: jest.fn((callback) => callback(mockError)),
                },
            };

            await expect(clearSession(mockReq)).rejects.toThrow('Destroy failed');
            expect(mockReq.session.destroy).toHaveBeenCalledTimes(1);
        });

        it('should resolve when req is null', async () => {
            await expect(clearSession(null)).resolves.toBeUndefined();
        });

        it('should resolve when req is undefined', async () => {
            await expect(clearSession(undefined)).resolves.toBeUndefined();
        });

        it('should resolve when req.session is null', async () => {
            const mockReq = {
                session: null,
            };

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
        });

        it('should resolve when req.session is undefined', async () => {
            const mockReq = {};

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
        });

        it('should resolve when req object is empty', async () => {
            const mockReq = {};

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
        });
    });

    describe('saveSession', () => {
        it('should successfully save a valid session', async () => {
            const mockReq = {
                session: {
                    save: jest.fn((callback) => callback(null)),
                },
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.save).toHaveBeenCalledTimes(1);
        });

        it('should reject with SESSION_SAVE_FAILED error when session.save fails', async () => {
            const mockError = new Error('Save failed');
            const mockReq = {
                session: {
                    save: jest.fn((callback) => callback(mockError)),
                },
            };

            await expect(saveSession(mockReq)).rejects.toBe(ErrorCodes.SYSTEM.SESSION_SAVE_FAILED);
            expect(mockReq.session.save).toHaveBeenCalledTimes(1);
        });

        it('should resolve when req is null', async () => {
            await expect(saveSession(null)).resolves.toBeUndefined();
        });

        it('should resolve when req is undefined', async () => {
            await expect(saveSession(undefined)).resolves.toBeUndefined();
        });

        it('should resolve when req.session is null', async () => {
            const mockReq = {
                session: null,
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
        });

        it('should resolve when req.session is undefined', async () => {
            const mockReq = {};

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
        });

        it('should resolve when req object is empty', async () => {
            const mockReq = {};

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
        });

        it('should handle session save callback being called multiple times', async () => {
            const mockReq = {
                session: {
                    save: jest.fn((callback) => {
                        callback(null);
                        // Simulating callback being called twice (should not cause issues)
                        callback(null);
                    }),
                },
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.save).toHaveBeenCalledTimes(1);
        });
    });

    describe('Integration scenarios', () => {
        it('should handle clearing and saving session in sequence', async () => {
            const mockReq = {
                session: {
                    destroy: jest.fn((callback) => callback(null)),
                },
            };

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.destroy).toHaveBeenCalledTimes(1);

            // After destroying, session might be recreated
            mockReq.session = {
                save: jest.fn((callback) => callback(null)),
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.save).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple save operations on same session', async () => {
            const mockReq = {
                session: {
                    save: jest.fn((callback) => callback(null)),
                },
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            await expect(saveSession(mockReq)).resolves.toBeUndefined();

            expect(mockReq.session.save).toHaveBeenCalledTimes(3);
        });

        it('should handle session operations with different error types', async () => {
            const stringError = 'String error';
            const mockReq1 = {
                session: {
                    destroy: jest.fn((callback) => callback(stringError)),
                },
            };

            await expect(clearSession(mockReq1)).rejects.toBe(stringError);

            const objectError = {message: 'Object error'};
            const mockReq2 = {
                session: {
                    destroy: jest.fn((callback) => callback(objectError)),
                },
            };

            await expect(clearSession(mockReq2)).rejects.toBe(objectError);
        });
    });

    describe('Edge cases', () => {
        it('should handle session with additional properties', async () => {
            const mockReq = {
                session: {
                    userId: 123,
                    data: {key: 'value'},
                    destroy: jest.fn((callback) => callback(null)),
                },
            };

            await expect(clearSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.destroy).toHaveBeenCalledTimes(1);
        });

        it('should handle request with additional properties', async () => {
            const mockReq = {
                user: {id: 123},
                headers: {'content-type': 'application/json'},
                session: {
                    save: jest.fn((callback) => callback(null)),
                },
            };

            await expect(saveSession(mockReq)).resolves.toBeUndefined();
            expect(mockReq.session.save).toHaveBeenCalledTimes(1);
        });

        it('should handle falsy req values', async () => {
            await expect(clearSession(false)).resolves.toBeUndefined();
            await expect(clearSession(0)).resolves.toBeUndefined();
            await expect(clearSession('')).resolves.toBeUndefined();

            await expect(saveSession(false)).resolves.toBeUndefined();
            await expect(saveSession(0)).resolves.toBeUndefined();
            await expect(saveSession('')).resolves.toBeUndefined();
        });
    });
});

