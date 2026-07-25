/**
 * M2-Tools – Special Item Group Editor Logic
 */

let groups = [];
let currentGroupIndex = -1;

// ── DOM ELEMENTS ─────────────────────────────────────
const groupsList = document.getElementById('groups-list');
const sidebarFooter = document.getElementById('sidebar-footer');
const editorStage = document.getElementById('editor-stage');
const editorContent = document.getElementById('editor-content');
const noSelection = document.getElementById('no-selection');
const itemsRows = document.getElementById('items-rows');
const searchInput = document.getElementById('group-search');

// Modal Elements
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const openSettings = document.getElementById('open-settings-btn');
const dropSpecialGroups = document.getElementById('drop-special-groups');
const dropItemNames = document.getElementById('drop-item-names');
const importBtn = document.getElementById('import-btn');

// ── INIT ─────────────────────────────────────────────
(async () => {
    // 1. Wait for Items
    const initialized = await window.m2Items.autoInit();
    if (!initialized) {
        console.warn('[SpecialGroups] Failed to load item data.');
    }
    
    // 2. Load from API
    try {
        const res = await window.m2Auth.authFetch('/api/special_item_group/load');
        const text = await res.text();
        if (text && text.trim().length > 0) {
            groups = parseSpecialItemGroup(text);
        }
    } catch (err) {
        console.error('Failed to load special_item_group.txt from server:', err);
        window.m2Toast('Fehler beim Laden vom Server', 'error');
    }

    renderGroupsList();
    
    // 3. SHOW SETTINGS DIRECTLY (User Request)
    if (groups.length === 0) {
        settingsModal.classList.remove('hidden');
    }
})();

openSettings.onclick = () => settingsModal.classList.remove('hidden');
closeSettings.onclick = () => settingsModal.classList.add('hidden');
document.getElementById('save-settings').onclick = () => {
    settingsModal.classList.add('hidden');
};

let autoSaveTimeout = null;

async function performServerSave(isSilent = false) {
    const output = buildSpecialItemGroupString();
    if (!output) return;
    
    try {
        const res = await window.m2Auth.authFetch('/api/special_item_group/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: output })
        });
        const data = await res.json();
        if (data.success && !isSilent) {
            window.m2Toast('Erfolgreich auf Server gespeichert!', 'success');
        } else if (!data.success) {
            throw new Error(data.error);
        }
    } catch (err) {
        if (!isSilent) window.m2Toast('Fehler beim Speichern auf dem Server', 'error');
        console.error(err);
    }
}

function saveToLocal() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        performServerSave(true);
    }, 1500);
}

// Create Group
document.getElementById('create-group-btn').onclick = () => {
    const name = `Group_${groups.length + 1}`;
    const newGroup = { 
        id: Date.now() + Math.random(), 
        name, 
        vnum: 0, 
        type: 'NORMAL', 
        comment: '', 
        items: [] 
    };
    groups.push(newGroup);
    saveToLocal();
    renderGroupsList();
    selectGroup(groups.length - 1);
};

// Add Item
document.getElementById('add-item-btn').onclick = () => {
    if (currentGroupIndex === -1) return;
    groups[currentGroupIndex].items.push({ 
        id: Date.now() + Math.random(), 
        vnum: 0, 
        count: 1, 
        prob: 10, 
        comment: '' 
    });
    saveToLocal();
    renderEditor();
    renderGroupsList();
};

// Search
searchInput.oninput = () => renderGroupsList();

// ── FILE IMPORTS ─────────────────────────────────────
dropSpecialGroups.onclick = () => createFileInput(handleSpecialGroups);
importBtn.onclick = () => createFileInput(handleSpecialGroups);
dropItemNames.onclick = () => createFileInput((text) => {
    window.m2Items.initNames(text);
    window.m2Toast('Item-Datenbank aktualisiert!', 'success');
    renderGroupsList();
    if (currentGroupIndex !== -1) renderEditor();
    settingsModal.classList.add('hidden');
});

function createFileInput(handler) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => handler(ev.target.result);
        reader.readAsText(file);
    };
    input.click();
}

function handleSpecialGroups(text) {
    try {
        const parsed = parseSpecialItemGroup(text);
        if (parsed.length === 0) throw new Error('Keine validen Gruppen gefunden.');
        groups = parsed;
        renderGroupsList();
        window.m2Toast(`${groups.length} Gruppen erfolgreich geladen! (Noch nicht auf Server gespeichert)`, 'success');
        settingsModal.classList.add('hidden');
    } catch (err) { 
        window.m2Toast('Import fehlgeschlagen: ' + err.message, 'error'); 
    }
}

// ── PARSER ───────────────────────────────────────────
function parseSpecialItemGroup(text) {
    const lines = text.split('\n');
    const result = [];
    let currentGroup = null;

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;

        if (line.toLowerCase().startsWith('group')) {
            const parts = line.split(/\s+/);
            currentGroup = {
                id: Date.now() + Math.random(),
                name: parts[1] || 'Unknown',
                vnum: 0,
                type: 'NORMAL',
                items: []
            };
            result.push(currentGroup);
        } else if (line.startsWith('Vnum')) {
            if (currentGroup) currentGroup.vnum = parseInt(line.split(/\s+/)[1]) || 0;
        } else if (line.startsWith('Type')) {
            if (currentGroup) currentGroup.type = line.split(/\s+/)[1] || 'NORMAL';
        } else if (/^\d+/.test(line)) {
            const parts = line.split(/\s+/);
            if (parts.length >= 4 && currentGroup) {
                currentGroup.items.push({
                    id: Date.now() + Math.random(),
                    vnum: parseInt(parts[1]) || 0,
                    count: parseInt(parts[2]) || 1,
                    prob: parseInt(parts[3]) || 1,
                    comment: parts.slice(4).join(' ').replace(/^#\s*/, '') || ''
                });
            }
        }
    });
    return result;
}

// ── RENDERING ────────────────────────────────────────
function renderGroupsList() {
    const query = searchInput.value.toLowerCase();
    const filtered = groups.filter(g => 
        window.m2Items.getName(g.vnum).toLowerCase().includes(query) ||
        g.name.toLowerCase().includes(query) || 
        g.vnum.toString().includes(query) ||
        (g.comment && g.comment.toLowerCase().includes(query))
    );
    
    if (filtered.length === 0) {
        groupsList.innerHTML = '<div class="list-empty">Keine Gruppen</div>';
    } else {
        groupsList.innerHTML = filtered.map((g) => {
            const actualIdx = groups.indexOf(g);
            return `
            <div class="group-item ${actualIdx === currentGroupIndex ? 'active' : ''}" onclick="selectGroup(${actualIdx})">
                <div class="g-icon" style="font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 1.1rem; color: var(--gold-primary); background: var(--bg-body); border-radius: 6px;">
                    ${actualIdx + 1}
                </div>
                <div class="g-info">
                    <span class="g-name">${window.m2Safe.escape(g.name)}</span>
                    <small>ID: ${g.vnum} • ${g.items.length} Items</small>
                </div>
            </div>
        `}).join('');
    }
    const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);
    sidebarFooter.textContent = `${groups.length} Gruppen • ${totalItems} Gegenstände`;
}

window.selectGroup = (index) => {
    currentGroupIndex = index;
    noSelection.classList.add('hidden');
    editorContent.classList.remove('hidden');
    renderGroupsList();
    renderEditor();
};

function renderEditor() {
    if (currentGroupIndex === -1) return;
    const group = groups[currentGroupIndex];
    
    document.getElementById('group-name').value = group.name;
    document.getElementById('group-vnum').value = group.vnum;
    document.getElementById('group-type').value = group.type;
    document.getElementById('group-comment').value = group.comment || '';
    
    // Icon & Name Lookup
    document.getElementById('target-name').textContent = window.m2Items.getName(group.vnum) || 'Keine Truhe ausgewählt';
    const targetIconImg = document.getElementById('target-icon-img');
    if (targetIconImg) {
        targetIconImg.src = window.m2Items.getIconPath(group.vnum);
    }
    
    // Listeners
    document.getElementById('group-name').oninput = (e) => { group.name = e.target.value; saveToLocal(); renderGroupsList(); };
    document.getElementById('group-vnum').oninput = (e) => { 
        group.vnum = parseInt(e.target.value) || 0; 
        const itemName = window.m2Items.getName(group.vnum) || '';
        document.getElementById('target-name').textContent = itemName || 'Keine Truhe ausgewählt';
        const targetIconImg = document.getElementById('target-icon-img');
        if (targetIconImg) targetIconImg.src = window.m2Items.getIconPath(group.vnum);
        
        if (itemName) {
            const safeName = itemName.replace(/[^a-zA-Z0-9_+]/g, '_');
            group.name = safeName;
            document.getElementById('group-name').value = safeName;
            group.comment = itemName;
            document.getElementById('group-comment').value = itemName;
        }

        saveToLocal();
        renderGroupsList(); 
    };
    document.getElementById('group-type').onchange = (e) => { group.type = e.target.value; saveToLocal(); };
    document.getElementById('group-comment').oninput = (e) => { group.comment = e.target.value; saveToLocal(); };

    // Render Items
    const totalWeight = group.items.reduce((acc, it) => acc + (it.prob || 0), 0) || 1;
    itemsRows.innerHTML = '';
    group.items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        const percent = ((it.prob / totalWeight) * 100).toFixed(1);
        const iconPath = window.m2Items.getIconPath(it.vnum);
        const itemName = window.m2Items.getName(it.vnum);
        
        row.innerHTML = `
            <div class="col-id" style="font-weight: 800; font-size: 1.1rem; color: var(--gold-primary); text-align: center;">${idx + 1}</div>
            
            <div class="col-vnum">
                <div class="vnum-input-box" style="display: flex; gap: 8px; align-items: center; border: 1px solid var(--border-color); background: var(--bg-body); padding: 4px; border-radius: var(--radius-sm);">
                    <div style="width: 32px; height: 32px; background: rgba(0,0,0,0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                        <img src="${iconPath}" class="row-icon" id="row-icon-${it.id}" style="max-width: 24px; max-height: 24px;" onerror="this.src='/shared/assets/no_icon.png'">
                    </div>
                    <input type="number" class="m2-input" value="${it.vnum}" placeholder="VNUM" style="flex: 1; min-width: 60px; padding: 6px; border: none; background: transparent; font-weight: bold;">
                    <button class="m2-btn m2-btn-secondary small" style="padding: 4px 8px; border-radius: 4px; width: auto;" onclick="openItemSearch(${idx})" title="Item suchen">🔍</button>
                </div>
            </div>
            
            <div class="col-comment" style="display: flex; flex-direction: column; gap: 4px; justify-content: center;">
                <div class="name-badge" id="row-name-${it.id}" style="font-weight: bold; color: var(--gold-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95rem; text-align: center;">${itemName || '-'}</div>
            </div>
            
            <div class="col-count">
                <input type="number" class="m2-input" value="${it.count}" min="1" style="text-align: center; font-weight: bold; padding: 6px;">
            </div>
            
            <div class="col-prob">
                <div class="prob-wrapper" style="position: relative;">
                    <input type="number" class="m2-input" value="${it.prob}" min="0" style="padding: 6px 45px 6px 10px; font-weight: bold;">
                    <span class="prob-pct" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 0.75rem; color: var(--text-muted); font-weight: 800;">${percent}%</span>
                </div>
            </div>
            
            <div class="col-actions" style="display: flex; justify-content: center;">
                <button class="action-btn delete" onclick="removeItem(${idx})" title="Löschen">✕</button>
            </div>
        `;
        
        const vnumInput = row.querySelector('.col-vnum input');
        const countInput = row.querySelector('.col-count input');
        const probInput = row.querySelector('.col-prob input');

        // VNUM
        vnumInput.oninput = (e) => { 
            it.vnum = parseInt(e.target.value) || 0;
            const newName = window.m2Items.getName(it.vnum) || '-';
            document.getElementById(`row-icon-${it.id}`).src = window.m2Items.getIconPath(it.vnum);
            document.getElementById(`row-name-${it.id}`).textContent = newName;
            
            // Auto Update Comment Field for the new VNUM
            if (newName !== '-' && (!it.comment || it.comment === window.m2Items.getName(it.vnum) || it.comment === '' || e.target.value.length > 0)) {
                it.comment = newName;
            }
            saveToLocal();
        };
        // COUNT
        countInput.oninput = (e) => { it.count = parseInt(e.target.value) || 1; saveToLocal(); };
        // PROB
        probInput.oninput = (e) => { it.prob = parseInt(e.target.value) || 0; saveToLocal(); renderEditor(); };
        
        itemsRows.appendChild(row);
    });
}

window.removeItem = (idx) => {
    groups[currentGroupIndex].items.splice(idx, 1);
    saveToLocal();
    renderEditor();
    renderGroupsList();
};

function buildSpecialItemGroupString() {
    if (groups.length === 0) return '';
    let output = '# M2-Tools Special Item Group Export\n\n';
    groups.forEach(g => {
        output += `Group\t${g.name}\n`;
        output += `{\n`;
        if (g.vnum) output += `\tVnum\t${g.vnum}\t# ${window.m2Items.getName(g.vnum)}\n`;
        if (g.type) output += `\tType\t${g.type}\n`;
        g.items.forEach((it, idx) => {
            const comment = it.comment || window.m2Items.getName(it.vnum) || '';
            output += `\t${idx + 1}\t${it.vnum}\t${it.count}\t${it.prob}\t# ${comment}\n`;
        });
        output += `}\n\n`;
    });
    return output;
}

document.getElementById('generate-btn').onclick = () => {
    const output = buildSpecialItemGroupString();
    if (!output) { window.m2Toast('Keine Gruppen vorhanden!', 'warning'); return; }
    
    const blob = new Blob([output], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = 'special_item_group.txt';
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    window.m2Toast('special_item_group.txt wurde heruntergeladen!', 'success');
};

document.getElementById('save-btn').onclick = () => {
    performServerSave(false);
};

// ── ITEM SEARCH OVERLAY ──────────────────────────────
let activeItemRowIndex = -1;
const itemOverlay = document.getElementById('item-search-overlay');
const itemSearchInput = document.getElementById('item-search-input');
const itemResults = document.getElementById('item-results');

window.openItemSearch = (lineIdx) => { 
    activeItemRowIndex = lineIdx; 
    itemOverlay.classList.remove('hidden'); 
    itemSearchInput.value = ''; 
    itemResults.innerHTML = ''; 
    itemSearchInput.focus(); 
};

itemSearchInput.oninput = (e) => {
    const q = e.target.value;
    if (q.length < 1) {
        itemResults.innerHTML = '';
        return;
    }
    const items = window.m2Items.search(q).slice(0, 50);
    itemResults.innerHTML = '';
    items.forEach(i => {
        const entry = document.createElement('div');
        entry.className = 'item-result-entry';
        entry.innerHTML = `
            <div class="res-icon"><img src="${window.m2Items.getIconPath(i.vnum)}" onerror="this.src='/shared/assets/no_icon.png'"></div>
            <div class="res-vnum">${i.vnum}</div>
            <div class="res-name">${i.name}</div>
        `;
        entry.onclick = () => {  
            const group = groups[currentGroupIndex];
            if (activeItemRowIndex === -1) {
                // Update group VNUM
                group.vnum = i.vnum;
                document.getElementById('group-vnum').value = i.vnum;
                document.getElementById('target-name').textContent = i.name;
                const targetIconImg = document.getElementById('target-icon-img');
                if (targetIconImg) targetIconImg.src = window.m2Items.getIconPath(i.vnum);
                
                const safeName = i.name.replace(/[^a-zA-Z0-9_+]/g, '_');
                group.name = safeName;
                document.getElementById('group-name').value = safeName;
                group.comment = i.name;
                document.getElementById('group-comment').value = i.name;

                renderGroupsList();
            } else {
                // Update item VNUM
                const it = group.items[activeItemRowIndex];
                it.vnum = i.vnum;
                document.getElementById(`row-icon-${it.id}`).src = window.m2Items.getIconPath(i.vnum);
                document.getElementById(`row-name-${it.id}`).textContent = i.name;
                const rowInputs = itemsRows.children[activeItemRowIndex].querySelectorAll('input');
                rowInputs[0].value = i.vnum;
            }
            saveToLocal();
            itemOverlay.classList.add('hidden'); 
        };
        itemResults.appendChild(entry);
    });
};

