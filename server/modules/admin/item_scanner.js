const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * M2-Tools – Auto-Import Scanner (Power Edition)
 * Verarbeitet item_proto.sql und Icon-Dateien aus data/imports/
 * Beachtet +0 bis +9 Vererbung für Icons.
 */

const IMPORT_DIR = path.join(__dirname, '../../../data/imports');
const DATA_DIR = path.join(__dirname, '../../../data');
const ICON_TARGET_DIR = process.env.ICONS_PATH || path.join(__dirname, '../../../public/assets/items');
const DB_FILE = path.join(DATA_DIR, 'item_db.json');

async function scan() {
    console.log('[Scanner] 🔍 Starte Auto-Import Scan...');
    
    if (!fs.existsSync(IMPORT_DIR)) fs.mkdirSync(IMPORT_DIR, { recursive: true });
    if (!fs.existsSync(ICON_TARGET_DIR)) fs.mkdirSync(ICON_TARGET_DIR, { recursive: true });

    const files = fs.readdirSync(IMPORT_DIR);
    let itemsFound = 0;
    let iconsMoved = 0;
    let itemMap = {};

    if (fs.existsSync(DB_FILE)) {
        try { itemMap = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
    }

    for (const file of files) {
        const fullPath = path.join(IMPORT_DIR, file);

        // -- SQL Parsing (Enhanced) --
        if (file.toLowerCase().endsWith('.sql')) {
            const lineReader = readline.createInterface({ input: fs.createReadStream(fullPath), crlfDelay: Infinity });
            for await (const line of lineReader) {
                // Focus on item_proto inserts
                if (line.toUpperCase().includes('INSERT INTO `ITEM_PROTO`')) {
                    // Extract everything between ( )
                    const matches = line.match(/\(([^)]+)\)/g);
                    if (matches) {
                        matches.forEach(m => {
                            const raw = m.substring(1, m.length - 1);
                            const values = raw.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
                            
                            // Metin2 SQL Schema (approximate, flexible)
                            // 0: vnum, 1: vnum_range/icon_vnum, 2: name, 3: locale_name, 7: size
                            const vnum = values[0];
                            if (!isNaN(vnum)) {
                                let name = values[3] || values[2]; 
                                if (name && name.startsWith('0x')) {
                                    try { name = Buffer.from(name.substring(2), 'hex').toString('utf8'); } catch(e){}
                                }
                                const size = parseInt(values[7]) || 1;
                                
                                // Base VNUM Logic (00010 for 10-19)
                                const vnumInt = parseInt(vnum);
                                let baseVnum = vnum;
                                if (vnumInt >= 10 && vnumInt < 100000) {
                                    // Items from 10 to 99999 often follow +0..+9 rule
                                    // If it ends in 1-9, the base is the one ending in 0
                                    const lastDigit = vnumInt % 10;
                                    if (lastDigit > 0) {
                                        baseVnum = (vnumInt - lastDigit).toString();
                                    }
                                }

                                itemMap[vnum] = { 
                                    name: name || `Item ${vnum}`, 
                                    size: size,
                                    icon: baseVnum.padStart(5, '0') // Always point to padded base
                                };
                                itemsFound++;
                            }
                        });
                    }
                }
            }
        }

        // -- Icon Management --
        if (file.toLowerCase().endsWith('.tga') || file.toLowerCase().endsWith('.png')) {
            const ext = path.extname(file).toLowerCase();
            const baseName = path.parse(file).name;
            const destName = baseName.length < 5 && !isNaN(baseName) ? baseName.padStart(5, '0') + ext : file;
            
            fs.copyFileSync(fullPath, path.join(ICON_TARGET_DIR, destName));
            iconsMoved++;
        }
    }

    if (itemsFound > 0 || iconsMoved > 0) {
        fs.writeFileSync(DB_FILE, JSON.stringify(itemMap, null, 2));
        return { success: true, items: itemsFound, icons: iconsMoved };
    }
    return { success: true, items: 0, icons: 0 }; // Always success if finished
}

module.exports = { scan };
