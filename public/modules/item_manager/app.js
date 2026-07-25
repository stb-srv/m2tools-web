/**
 * M2-Tools – Item-Manager Logic
 */

// ── DOM ELEMENTS ─────────────────────────────────────
const itemList = document.getElementById('item-list');
const itemSearch = document.getElementById('item-search');
const totalItemsSpan = document.getElementById('total-items');
const uniqueIconsSpan = document.getElementById('unique-icons');

// Modal
const settingsModal = document.getElementById('settings-modal');
const openSettings = document.getElementById('open-settings-btn');
const closeSettings = document.getElementById('close-settings');
const dropItemNames = document.getElementById('drop-item-names');

// ── INIT ─────────────────────────────────────────────
openSettings.onclick = () => settingsModal.classList.remove('hidden');
closeSettings.onclick = () => settingsModal.classList.add('hidden');
document.getElementById('save-settings').onclick = () => settingsModal.classList.add('hidden');

// Auto-Sync with Server
(async () => {
    const hasData = await window.m2Items.autoInit();
    if (hasData) {
        renderItems();
        // If we have items, don't force the modal
    } else {
        settingsModal.classList.remove('hidden');
    }
})();

// Search Logic
itemSearch.oninput = (e) => {
    debounce(() => renderItems(e.target.value), 300);
};

// ── FILE IMPORTS ─────────────────────────────────────
dropItemNames.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            window.m2Items.initNames(e.target.result);
            renderItems();
            window.m2Toast('item_names.txt erfolgreich importiert!', 'success');
            settingsModal.classList.add('hidden');
        };
        reader.readAsText(file);
    };
    input.click();
};

// ── RENDERING ────────────────────────────────────────
function renderItems(query = '') {
    const allItems = Object.entries(window.m2Items._items);
    let filtered = allItems;

    if (query) {
        query = query.toLowerCase();
        filtered = allItems.filter(([vnum, data]) => 
            vnum.includes(query) || (data.name && data.name.toLowerCase().includes(query))
        );
    }

    // Limit to first 200 items for performance (progressive rendering)
    const displayList = filtered.slice(0, 200);
    
    totalItemsSpan.textContent = allItems.length;
    
    // Count unique icon bases
    const uniqueBases = new Set(allItems.map(([vnum, name]) => window.m2Items.getBaseVnum(vnum)));
    uniqueIconsSpan.textContent = uniqueBases.size;

    if (displayList.length === 0) {
        itemList.innerHTML = '<div class="list-empty">Keine Items gefunden.</div>';
        return;
    }

    itemList.innerHTML = displayList.map(([vnum, data]) => {
        const baseVnum = window.m2Items.getBaseVnum(vnum);
        const iconPath = window.m2Items.getIconPath(vnum);
        const isMapped = baseVnum != vnum;
        const paddedBase = baseVnum.toString().padStart(5, '0');
        const size = data.size || 1;
        const itemName = data.name || `VNUM ${vnum}`;

        return `
            <div class="item-row">
                <div class="it-icon-box" style="height: ${size * 32}px">
                    <img src="${iconPath}" onerror="this.src='/shared/assets/no_icon.png'">
                </div>
                <div class="it-vnum">${vnum}</div>
                <div class="it-name">${window.m2Safe.escape(itemName)}</div>
                <div class="it-base">${paddedBase}.tga</div>
                <div class="it-status ${isMapped ? 'status-mapped' : 'status-valid'}">
                    ${isMapped ? `Mapped (+${vnum % 10})` : 'Basis-ID'}
                </div>
            </div>
        `;
    }).join('');

    if (filtered.length > 200) {
        const moreElem = document.createElement('div');
        moreElem.className = 'list-empty';
        moreElem.textContent = `... und ${filtered.length - 200} weitere Items (Suche verfeinern für mehr Details).`;
        itemList.appendChild(moreElem);
    }
}

// ── UTILITIES ────────────────────────────────────────
let debounceTimer;
function debounce(func, delay) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
}
