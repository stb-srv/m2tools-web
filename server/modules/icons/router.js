const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const { requireAuth } = require('../auth/middleware');
const { getActiveWorkspace } = require('../../utils/workspace');
const storageService = require('../../services/storageService');
const ApiError = require('../../utils/apiError');

// Configure Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB max per single icon
});

/**
 * Upload an icon for a specific vnum.
 */
router.post('/upload/:vnum', requireAuth, upload.single('icon'), async (req, res, next) => {
    try {
        const userId = req.user.id;
        const vnum = req.params.vnum;
        const file = req.file;

        if (!file) throw ApiError.badRequest('Keine Datei hochgeladen');
        if (!vnum) throw ApiError.badRequest('VNUM erforderlich');

        const ws = await getActiveWorkspace(userId);
        if (!ws) throw ApiError.badRequest('Kein aktiver Workspace ausgewählt');

        // Check quota
        try {
            await storageService.checkQuota(userId, file.size);
        } catch (qErr) {
            if (qErr.code === 'QUOTA_EXCEEDED') {
                throw new ApiError(403, 'Speicherkontingent überschritten', {
                    usage: Math.round(qErr.usage / 1024 / 1024 * 100) / 100 + 'MB',
                    limit: Math.round(qErr.limit / 1024 / 1024 * 100) / 100 + 'MB'
                });
            }
            throw qErr;
        }

        const wsIconPath = storageService.getWorkspaceIconPath(userId, ws.id);
        if (!existsSync(wsIconPath)) await fs.mkdir(wsIconPath, { recursive: true });

        const fileName = `${vnum}.png`;
        const destPath = path.join(wsIconPath, fileName);

        await fs.writeFile(destPath, file.buffer);

        res.json({ 
            success: true, 
            path: `/api/cube/icon/${vnum}`, 
            size: file.size 
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Delete an icon.
 */
router.delete('/:vnum', requireAuth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const vnum = req.params.vnum;

        const ws = await getActiveWorkspace(userId);
        if (!ws) throw ApiError.badRequest('Kein aktiver Workspace ausgewählt');

        const wsIconPath = storageService.getWorkspaceIconPath(userId, ws.id);
        const filePath = path.join(wsIconPath, `${vnum}.png`);

        if (existsSync(filePath)) {
            await fs.unlink(filePath);
        }

        res.json({ success: true });
    } catch (err) {
        next(ApiError.internal('Löschen fehlgeschlagen', err.message));
    }
});

module.exports = router;
