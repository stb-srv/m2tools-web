const fs = require('fs-extra');
const path = require('path');

/**
 * M2-Tools – Dynamic Module Loader
 * Scans server/modules/ for module.json files to build a decentralized registry.
 */
function getModuleRegistry() {
    const modulesBaseDir = path.join(__dirname, '../modules');
    
    // Safety check if directory exists
    if (!fs.existsSync(modulesBaseDir)) {
        console.warn('[ModuleLoader] modules directory not found:', modulesBaseDir);
        return [];
    }

    const folders = fs.readdirSync(modulesBaseDir);
    const registry = [];

    for (const folder of folders) {
        const moduleJsonPath = path.join(modulesBaseDir, folder, 'module.json');
        if (fs.existsSync(moduleJsonPath)) {
            try {
                const config = fs.readJsonSync(moduleJsonPath);
                // Ensure id matches folder name if not specified
                if (!config.id) config.id = folder;
                registry.push(config);
            } catch (err) {
                console.error(`[ModuleLoader] Error reading module.json in ${folder}:`, err.message);
            }
        }
    }

    // Sort by category or priority if needed
    return registry;
}

module.exports = { getModuleRegistry };
