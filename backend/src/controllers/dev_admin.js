/**
 * @file Dev Admin Controller
 *
 * Provides admin endpoints for managing users across SteVe, Odoo, and Database.
 * These endpoints are protected by Tailscale network authentication middleware.
 *
 * SECURITY: Access is restricted to requests originating from Tailscale IP addresses.
 *
 * @module controllers/dev_admin
 */

const {db} = require('#utils/queries');
const {getSteveUser, blockSteveUser, unblockSteveUser, deleteSteveUser} = require('#services/steve_user');
const logger = require('#services/logger');

/**
 * Get all users with their status across all systems
 */
async function getAllUsers(req, res) {
    try {
        const users = await db.getUsers({}, {orderBy: 'created_at', orderDirection: 'DESC'});

        res.json({
            success: true,
            data: users.map(user => ({
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                rfid: user.rfid,
                steve_id: user.steve_id,
                odoo_user_id: user.odoo_user_id,
                odoo_partner_id: user.odoo_partner_id,
                deactivated_at: user.deactivated_at,
                created_at: user.created_at,
                has_steve: user.steve_id !== null,
                has_odoo: user.odoo_user_id !== null,
                is_active: user.deactivated_at === null
            }))
        });
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch users'
        });
    }
}

/**
 * Block user in SteVe
 */
async function blockUserInSteve(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (!user.steve_id) {
            return res.status(400).json({success: false, error: 'User does not have a SteVe account'});
        }

        await blockSteveUser(user);

        res.json({
            success: true,
            message: `User ${user.name} blocked in SteVe`
        });
    } catch (error) {
        logger.error('Error blocking user in SteVe:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to block user in SteVe'
        });
    }
}

/**
 * Unblock user in SteVe
 */
async function unblockUserInSteve(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (!user.steve_id) {
            return res.status(400).json({success: false, error: 'User does not have a SteVe account'});
        }

        await unblockSteveUser(user);

        res.json({
            success: true,
            message: `User ${user.name} unblocked in SteVe`
        });
    } catch (error) {
        logger.error('Error unblocking user in SteVe:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to unblock user in SteVe'
        });
    }
}

/**
 * Delete user from SteVe
 */
async function deleteUserFromSteve(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (!user.steve_id) {
            return res.status(400).json({success: false, error: 'User does not have a SteVe account'});
        }

        await deleteSteveUser(user);

        // Clear steve_id from database
        await db.updateUser(user.user_id, {steve_id: null});

        res.json({
            success: true,
            message: `User ${user.name} deleted from SteVe`
        });
    } catch (error) {
        logger.error('Error deleting user from SteVe:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete user from SteVe'
        });
    }
}

/**
 * Deactivate user in database
 */
async function deactivateUserInDB(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (user.deactivated_at) {
            return res.status(400).json({success: false, error: 'User is already deactivated'});
        }

        await db.deactivateUser(user);

        res.json({
            success: true,
            message: `User ${user.name} deactivated in database`
        });
    } catch (error) {
        logger.error('Error deactivating user in DB:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to deactivate user in database'
        });
    }
}

/**
 * Activate user in database
 */
async function activateUserInDB(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (!user.deactivated_at) {
            return res.status(400).json({success: false, error: 'User is already active'});
        }

        await db.activateUser(user);

        res.json({
            success: true,
            message: `User ${user.name} activated in database`
        });
    } catch (error) {
        logger.error('Error activating user in DB:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to activate user in database'
        });
    }
}

/**
 * Delete user from database (PERMANENT - USE WITH CAUTION)
 */
async function deleteUserFromDB(req, res) {
    try {
        const {user_id} = req.params;
        const {confirm} = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                error: 'Confirmation required. Send {confirm: "DELETE"} in request body'
            });
        }

        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        await db.deleteUser(user);

        res.json({
            success: true,
            message: `User ${user.name} permanently deleted from database`
        });
    } catch (error) {
        logger.error('Error deleting user from DB:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete user from database'
        });
    }
}

/**
 * Revoke Odoo credentials for user
 */
async function revokeOdooCredentials(req, res) {
    try {
        const {user_id} = req.params;
        const user = await db.getUserUnique({user_id: parseInt(user_id)});

        if (!user) {
            return res.status(404).json({success: false, error: 'User not found'});
        }

        if (!user.odoo_user_id) {
            return res.status(400).json({success: false, error: 'User does not have Odoo id'});
        }

        await db.revokeUserOdooCredentials(user);

        res.json({
            success: true,
            message: `Odoo credentials revoked for user ${user.name}`
        });
    } catch (error) {
        logger.error('Error revoking Odoo credentials:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to revoke Odoo credentials'
        });
    }
}

module.exports = {
    getAllUsers,
    blockUserInSteve,
    unblockUserInSteve,
    deleteUserFromSteve,
    deactivateUserInDB,
    activateUserInDB,
    deleteUserFromDB,
    revokeOdooCredentials
};

