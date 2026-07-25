const db = require('../../config/database');
const ApiError = require('../../utils/apiError');

// List teams for user
const list = async (req, res, next) => {
    try {
        const [rows] = await db.query(
            `SELECT t.*, COUNT(tm.user_id) as memberCount FROM m2em_teams t
             LEFT JOIN m2em_team_members tm ON t.id = tm.team_id
             WHERE t.owner_id = ? OR t.id IN (SELECT team_id FROM m2em_team_members WHERE user_id = ?)
             GROUP BY t.id`,
            [req.user.id, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        next(ApiError.internal('Fehler beim Auflisten der Teams', err.message));
    }
};

// Create team
const create = async (req, res, next) => {
    const { name } = req.body;
    if (!name) return next(ApiError.badRequest('Name ist erforderlich'));

    try {
        // Enforce Case-Insensitive Unique Name
        const [existing] = await db.query('SELECT id FROM m2em_teams WHERE LOWER(name) = LOWER(?)', [name]);
        if (existing.length > 0) throw ApiError.badRequest('Dieser Teamname ist bereits vergeben.');

        // Enforce Limit
        const [userRows] = await db.query('SELECT role FROM m2em_users WHERE id = ?', [req.user.id]);
        const userRole = userRows[0]?.role || 'user';
        
        if (userRole !== 'admin') {
            const [limitRows] = await db.query('SELECT value FROM system_settings WHERE key = ?', ['max_teams_per_user']);
            const maxTeams = parseInt(limitRows[0]?.value || '3');

            const [countRows] = await db.query('SELECT COUNT(*) as c FROM m2em_teams WHERE owner_id = ?', [req.user.id]);
            if ((countRows[0]?.c || 0) >= maxTeams) {
                throw ApiError.forbidden(`Limit erreicht: Du kannst nur maximal ${maxTeams} Teams besitzen.`);
            }
        }

        const [result] = await db.query(
            'INSERT INTO m2em_teams (name, owner_id) VALUES (?, ?)',
            [name, req.user.id]
        );
        const teamId = result.insertId;

        // Add owner as member
        await db.query(
            'INSERT INTO m2em_team_members (team_id, user_id, role) VALUES (?, ?, ?)',
            [teamId, req.user.id, 'owner']
        );

        res.json({ success: true, id: teamId });
    } catch (err) {
        next(err);
    }
};

// Get team details with members
const getDetails = async (req, res, next) => {
    const { id } = req.params;
    try {
        const [teamRows] = await db.query('SELECT * FROM m2em_teams WHERE id = ?', [id]);
        if (teamRows.length === 0) throw ApiError.notFound('Team nicht gefunden');

        const [members] = await db.query(
            `SELECT u.id, u.username, u.display_name, tm.role FROM m2em_team_members tm
             JOIN m2em_users u ON tm.user_id = u.id
             WHERE tm.team_id = ?`,
            [id]
        );

        res.json({ team: teamRows[0], members });
    } catch (err) {
        next(err);
    }
};

// Add member by username
const addMember = async (req, res, next) => {
    const { teamId, username } = req.body;
    if (!teamId || !username) return next(ApiError.badRequest('Team-ID und Benutzername erforderlich'));

    try {
        // Only owner can add
        const [team] = await db.query('SELECT id FROM m2em_teams WHERE id = ? AND owner_id = ?', [teamId, req.user.id]);
        if (team.length === 0) throw ApiError.forbidden('Nicht berechtigt');

        const [user] = await db.query('SELECT id FROM m2em_users WHERE username = ?', [username]);
        if (user.length === 0) throw ApiError.notFound('Nutzer nicht gefunden');

        // Enforce Team Size Limit
        const [limitRows] = await db.query('SELECT value FROM system_settings WHERE key = ?', ['max_team_members']);
        const maxMembers = parseInt(limitRows[0]?.value || '5');

        const [countRows] = await db.query('SELECT COUNT(*) as c FROM m2em_team_members WHERE team_id = ?', [teamId]);
        if ((countRows[0]?.c || 0) >= maxMembers) {
            throw ApiError.forbidden(`Team-Limit erreicht (Max. ${maxMembers} Mitglieder).`);
        }

        await db.query(
            'INSERT OR IGNORE INTO m2em_team_members (team_id, user_id, role) VALUES (?, ?, ?)',
            [teamId, user[0].id, 'member']
        );

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// Remove member
const removeMember = async (req, res, next) => {
    const { teamId, userId } = req.body;
    if (!teamId || !userId) return next(ApiError.badRequest('Team-ID und Benutzer-ID erforderlich'));

    try {
        // Only owner can remove someone else, or a member can leave
        const [team] = await db.query('SELECT id FROM m2em_teams WHERE id = ? AND owner_id = ?', [teamId, req.user.id]);
        const isOwner = team.length > 0;
        
        if (!isOwner && parseInt(userId) !== req.user.id) {
            throw ApiError.forbidden('Nicht berechtigt');
        }

        await db.query('DELETE FROM m2em_team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

const deleteTeam = async (req, res, next) => {
    const { id, teamId } = req.body;
    const tid = id || teamId;
    if (!tid) return next(ApiError.badRequest('Team-ID fehlt'));

    try {
        // Only owner or admin can delete
        const [team] = await db.query('SELECT owner_id FROM m2em_teams WHERE id = ?', [tid]);
        if (team.length === 0) throw ApiError.notFound('Team existiert nicht');

        const isOwner = team[0].owner_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isOwner && !isAdmin) throw ApiError.forbidden('Nicht berechtigt');

        // Delete members first
        await db.query('DELETE FROM m2em_team_members WHERE team_id = ?', [tid]);
        // Delete team
        await db.query('DELETE FROM m2em_teams WHERE id = ?', [tid]);
        
        // Unlink workspaces
        await db.query('UPDATE workspaces SET team_id = NULL WHERE team_id = ?', [tid]);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// Admin List All Teams
const listAll = async (req, res, next) => {
    try {
        const [rows] = await db.query(
            `SELECT t.*, u.username as owner_name, (SELECT COUNT(*) FROM m2em_team_members WHERE team_id = t.id) as memberCount 
             FROM m2em_teams t
             LEFT JOIN m2em_users u ON t.owner_id = u.id
             ORDER BY t.created_at DESC`
        );
        res.json(rows);
    } catch (err) {
        next(ApiError.internal('Fehler beim Auflisten aller Teams', err.message));
    }
};

module.exports = { list, create, getDetails, addMember, removeMember, deleteTeam, listAll };
