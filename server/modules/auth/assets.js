const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { requireAuth } = require('./middleware');

const upload = multer({ dest: 'tmp/uploads/' });

/**
 * Upload items icons ZIP and extract to user folder.
 */
router.post('/upload-icons', requireAuth, upload.single('icons'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'Keine Datei hochgeladen' });

    const userId = req.user.id;
    const projectRoot = process.cwd();
    const userAssetsPath = path.join(projectRoot, 'public', 'assets', 'users', userId.toString(), 'items');

    try {
        // Create directory if not exists
        if (!fs.existsSync(userAssetsPath)) {
            fs.mkdirSync(userAssetsPath, { recursive: true });
        }

        const zip = new AdmZip(req.file.path);
        const zipEntries = zip.getEntries();
        
        let count = 0;
        zipEntries.forEach(entry => {
            // Only extract .png or .tga files
            if (!entry.isDirectory && (entry.entryName.toLowerCase().endsWith('.png') || entry.entryName.toLowerCase().endsWith('.tga'))) {
                // Flatten folder structure if user zipped a folder
                const fileName = path.basename(entry.entryName);
                fs.writeFileSync(path.join(userAssetsPath, fileName), entry.getData());
                count++;
            }
        });

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        res.json({ success: true, count, message: `${count} Icons erfolgreich hochgeladen und verarbeitet.` });
    } catch (err) {
        console.error('[Assets] Upload error:', err);
        res.status(500).json({ success: false, error: 'Fehler beim Entpacken der Icons: ' + err.message });
    }
});

module.exports = router;
