/**
 * M2-Tools – Mob-Drop Editor (Visual & Fixer)
 * Logic for managing Metin2 monster drops.
 */

(function() {
    'use strict';

    let currentGroups = [];
    let selectedGroupIndex = -1;
    let currentTab = 'visual';

    const dom = {
        tabs: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        groupList: document.getElementById('group-list'),
        groupSearch: document.getElementById('group-search'),
        editorEmpty: document.getElementById('editor-empty'),
        editorForm: document.getElementById('editor-form'),
        itemsTbody: document.getElementById('items-tbody'),
        
        // Field Inputs
        editGroupId: document.getElementById('edit-group-id'),
        editMobVnum: document.getElementById('edit-mob-vnum'),
        editGroupType: document.getElementById('edit-group-type'),
        
        // Action Buttons
        loadBtn: document.getElementById('load-btn'),
        saveBtn: document.getElementById('save-btn'),
        addGroupBtn: document.getElementById('add-group-btn'),
        addItemBtn: document.getElementById('add-item-btn'),
        
        // Raw Fixer
        rawTextarea: document.getElementById('raw-textarea'),
        fixTextBtn: document.getElementById('fix-text-btn'),

        // Rate Manager
        ratesTbody: document.getElementById('rates-tbody'),
        rateSearch: document.getElementById('rate-search'),
        batchActionType: document.getElementById('batch-action-type'),
        batchActionValue: document.getElementById('batch-action-value'),
        applyBatchBtn: document.getElementById('apply-batch-btn'),
        statTotalRates: document.getElementById('stat-total-rates'),

        // Overlays
        mobResults: document.getElementById('mob-results'),
        itemOverlay: document.getElementById('item-search-overlay'),
        itemSearchInput: document.getElementById('item-search-input'),
        itemResults: document.getElementById('item-results')
    };

    let activeItemRowIndex = -1;

    // ── Initialization ─────────────────────────────────
    async function init() {
        await window.m2Items.autoInit();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Tabs
        dom.tabs.forEach(btn => {
            btn.onclick = () => switchTab(btn.dataset.tab);
        });

        // Actions
        dom.loadBtn.onclick = () => openLocalFile();
        dom.saveBtn.onclick = () => downloadFile();
        dom.addGroupBtn.onclick = () => createNewGroup();
        dom.addItemBtn.onclick = () => addItemToCurrentGroup();

        // Missing functions implemented
        window.openLocalFile = function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    currentGroups = parseMobDropText(ev.target.result);
                    renderGroupList();
                    if (currentGroups.length > 0) selectGroup(0);
                };
                reader.readAsText(file);
            };
            input.click();
        };

        window.downloadFile = function() {
            if (currentGroups.length === 0) return window.m2Toast('Keine Daten zum Speichern', 'warning');
            const data = stringifyGroups(currentGroups);
            const blob = new Blob([data], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mob_drop_item.txt';
            a.click();
            URL.revokeObjectURL(url);
            window.m2Toast('Erfolgreich heruntergeladen!', 'success');
        };

        window.createNewGroup = function() {
            const id = 'New_Group_' + (currentGroups.length + 1);
            currentGroups.push({ id, mob: '0', type: 'drop', lines: [] });
            renderGroupList();
            selectGroup(currentGroups.length - 1);
        };


        // Search
        dom.groupSearch.oninput = (e) => filterGroups(e.target.value);
        dom.editMobVnum.oninput = (e) => {
            currentGroups[selectedGroupIndex].mob = e.target.value;
            fetchMobName(e.target.value, `mob-name-nav-${selectedGroupIndex}`);
            searchMobs(e.target.value);
        };
        
        // Item Search Overlay
        dom.itemSearchInput.oninput = (e) => searchItems(e.target.value);

        // Raw Fixer
        dom.fixTextBtn.onclick = () => fixRawText();

        // Rate Manager
        dom.rateSearch.oninput = (e) => filterRates(e.target.value);
        dom.applyBatchBtn.onclick = () => applyBatchAction();

        document.onclick = (e) => {
            if (!dom.editMobVnum.contains(e.target)) dom.mobResults.classList.add('hidden');
        };
    }

    // ... (logic remains)

    function renderGroupList() {
        dom.groupList.innerHTML = '';
        if (currentGroups.length === 0) {
            dom.groupList.innerHTML = '<div class="group-list-empty">Keine Gruppen</div>';
            return;
        }

        currentGroups.forEach((g, idx) => {
            const item = document.createElement('div');
            item.className = `group-item ${selectedGroupIndex === idx ? 'active' : ''}`;
            item.innerHTML = `
                <span class="group-item-id">${g.id}</span>
                <span class="group-item-mob">📂 <span id="mob-name-nav-${idx}">${g.mob || '0'}</span> / ${g.lines.length} Items</span>
            `;
            item.onclick = () => selectGroup(idx);
            dom.groupList.appendChild(item);
            if (g.mob && g.mob !== '0') fetchMobName(g.mob, `mob-name-nav-${idx}`);
        });
    }

    function selectGroup(idx) {
        selectedGroupIndex = idx;
        const g = currentGroups[idx];
        dom.editorEmpty.classList.add('hidden');
        dom.editorForm.classList.remove('hidden');
        Array.from(dom.groupList.children).forEach((item, i) => item.classList.toggle('active', i === idx));

        dom.editGroupId.value = g.id;
        dom.editMobVnum.value = g.mob;
        dom.editGroupType.value = g.type;

        dom.editGroupId.oninput = (e) => { g.id = e.target.value; renderGroupList(); };
        renderItemsTable(g);
    }

    function renderItemsTable(g) {
        dom.itemsTbody.innerHTML = '';
        g.lines.forEach((l, idx) => {
            const row = document.createElement('tr');
            const itemName = window.m2Items.getName(l.vnum);
            row.innerHTML = `
                <td class="item-row-num">${idx + 1}</td>
                <td><div class="item-icon-box" onclick="openItemSearch(${idx})"><img src="${window.m2Items.getIconPath(l.vnum)}" onerror="this.src='/shared/assets/no_icon.png'"></div></td>
                <td><input type="number" class="m2-input small" value="${l.vnum}" oninput="updateItemVnum(${idx}, this.value)"></td>
                <td id="item-name-${idx}">${window.m2Safe.escape(itemName)}</td>
                <td class="item-input-cell"><input type="number" class="m2-input small" value="${l.count}" oninput="currentGroups[${selectedGroupIndex}].lines[${idx}].count=this.value"></td>
                <td class="item-input-cell"><input type="number" class="m2-input small" value="${l.prob}" oninput="currentGroups[${selectedGroupIndex}].lines[${idx}].prob=this.value"></td>
                <td><button class="m2-btn small m2-btn-secondary" onclick="removeItemLine(${idx})">🗑️</button></td>
            `;
            dom.itemsTbody.appendChild(row);
        });
    }

    window.updateItemVnum = (idx, val) => {
        const g = currentGroups[selectedGroupIndex];
        g.lines[idx].vnum = val;
        const nameEl = document.getElementById(`item-name-${idx}`);
        if (nameEl) nameEl.textContent = window.m2Items.getName(val);
        const img = dom.itemsTbody.rows[idx].querySelector('img');
        if (img) img.src = window.m2Items.getIconPath(val);
    };

    window.removeItemLine = (idx) => {
        currentGroups[selectedGroupIndex].lines.splice(idx, 1);
        renderItemsTable(currentGroups[selectedGroupIndex]);
    };

    function addItemToCurrentGroup() {
        if (selectedGroupIndex === -1) return;
        currentGroups[selectedGroupIndex].lines.push({ vnum: '0', count: '1', prob: '1000' });
        renderItemsTable(currentGroups[selectedGroupIndex]);
    }

    async function fetchMobName(vnum, targetId) {
        if (!vnum || vnum === '0') return;
        try {
            const res = await fetch('/api/quest_builder/mobs/search?q=' + vnum, { headers: { ...(window.m2Auth?.authHeaders() || {}) } });
            const mobs = await res.json();
            const match = mobs.find(m => m.vnum.toString() === vnum.toString());
            const el = document.getElementById(targetId);
            if (el) el.textContent = match ? `${vnum} (${match.name})` : vnum;
        } catch {}
    }

    async function searchMobs(q) {
        if (!q || q.length < 2) { dom.mobResults.classList.add('hidden'); return; }
        try {
            const res = await fetch('/api/quest_builder/mobs/search?q=' + q, { headers: { ...(window.m2Auth?.authHeaders() || {}) } });
            const mobs = await res.json();
            dom.mobResults.innerHTML = '';
            if (mobs.length === 0) { dom.mobResults.classList.add('hidden'); return; }
            mobs.slice(0, 10).forEach(m => {
                const d = document.createElement('div');
                d.className = 'item-result-entry';
                d.innerHTML = `<strong>${m.vnum}</strong> - ${m.name}`;
                d.onclick = () => {
                    dom.editMobVnum.value = m.vnum;
                    currentGroups[selectedGroupIndex].mob = m.vnum;
                    dom.mobResults.classList.add('hidden');
                    renderGroupList();
                };
                dom.mobResults.appendChild(d);
            });
            dom.mobResults.classList.remove('hidden');
        } catch {}
    }

    // ── Item Overlay ──
    window.openItemSearch = (lineIdx) => { 
        activeItemRowIndex = lineIdx; 
        dom.itemOverlay.classList.remove('hidden'); 
        dom.itemSearchInput.value = ''; 
        dom.itemResults.innerHTML = ''; 
        dom.itemSearchInput.focus(); 
    };

    function searchItems(q) {
        if (q.length < 1) return;
        const items = window.m2Items.search(q).slice(0, 50);
        dom.itemResults.innerHTML = '';
        items.forEach(i => {
            const entry = document.createElement('div');
            entry.className = 'item-result-entry';
            entry.innerHTML = `<div class="res-icon"><img src="${window.m2Items.getIconPath(i.vnum)}"></div><span class="res-vnum">${i.vnum}</span><span class="res-name">${i.name}</span>`;
            entry.onclick = () => { 
                updateItemVnum(activeItemRowIndex, i.vnum); 
                dom.itemOverlay.classList.add('hidden'); 
            };
            dom.itemResults.appendChild(entry);
        });
    }

    // ── Rate Manager Logic ───────────────────────
    let flatRates = [];

    function renderRatesTab() {
        dom.ratesTbody.innerHTML = '';
        flatRates = [];
        currentGroups.forEach((group, gIdx) => {
            group.lines.forEach((line, lIdx) => {
                flatRates.push({ groupName: group.id, gIdx, lIdx, vnum: line.vnum, prob: line.prob });
            });
        });
        dom.statTotalRates.textContent = flatRates.length;
        flatRates.forEach((item, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><div class="item-icon-box"><img src="${window.m2Items.getIconPath(item.vnum)}" onerror="this.src='/shared/assets/no_icon.png'"></div></td>
                <td class="res-vnum">${item.vnum}</td>
                <td class="item-name-cell">${window.m2Safe.escape(window.m2Items.getName(item.vnum))}</td>
                <td class="rate-group-name">${item.groupName}</td>
                <td class="item-input-cell"><input type="number" class="m2-input small" value="${item.prob}" oninput="updateSingleRate(${idx}, this.value)"></td>
            `;
            dom.ratesTbody.appendChild(row);
        });
        if (dom.rateSearch.value) filterRates(dom.rateSearch.value);
    }

    window.updateSingleRate = (idx, val) => {
        const item = flatRates[idx];
        item.prob = val;
        currentGroups[item.gIdx].lines[item.lIdx].prob = val;
    };

    function filterRates(query) {
        const q = query.toLowerCase();
        Array.from(dom.ratesTbody.rows).forEach((row, idx) => {
            const item = flatRates[idx];
            const name = window.m2Items.getName(item.vnum).toLowerCase();
            const visible = item.vnum.toString().includes(q) || name.includes(q) || item.groupName.toLowerCase().includes(q);
            row.style.display = visible ? 'table-row' : 'none';
        });
    }

    function applyBatchAction() {
        const type = dom.batchActionType.value;
        const val = parseFloat(dom.batchActionValue.value);
        if (isNaN(val)) return m2Toast('Ungültiger Wert', 'error');

        let count = 0;
        Array.from(dom.ratesTbody.rows).forEach((row, idx) => {
            if (row.style.display === 'none') return;
            const item = flatRates[idx];
            let current = parseFloat(item.prob);
            let newVal = current;
            if (type === 'multiply') newVal = current * val;
            else if (type === 'add') newVal = current + val;
            else if (type === 'set') newVal = val;
            newVal = Math.floor(newVal); 
            if (newVal < 0) newVal = 0;
            item.prob = newVal;
            currentGroups[item.gIdx].lines[item.lIdx].prob = newVal;
            row.querySelector('input').value = newVal;
            count++;
        });
        m2Toast(`${count} Einträge aktualisiert.`, 'success');
    }

    function parseMobDropText(text) {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        const groups = [];
        let curr = null;
        for (let l of lines) {
            l = l.trim();
            if (!l || l.startsWith('//')) continue;
            if (l.toLowerCase().startsWith('group')) { 
                const name = l.substring(5).trim();
                curr = { id: name, mob: '0', type: 'drop', lines: [] }; 
                continue; 
            }
            if (l === '}' && curr) { groups.push(curr); curr = null; continue; }
            if (curr) {
                const p = l.split(/\s+/);
                if (p[0] === 'Mob') curr.mob = p[1];
                else if (p[0] === 'Type') curr.type = p[1];
                else if (!isNaN(p[0])) curr.lines.push({ vnum: p[1], count: p[2] || 1, prob: p[3] || 1 });
            }
        }
        return groups;
    }

    function stringifyGroups(groups) {
        let out = '';
        groups.forEach(g => {
            out += `Group\t${g.id}\n{\n\tMob\t${g.mob}\n\tType\t${g.type}\n`;
            g.lines.forEach((l, i) => out += `\t${i + 1}\t${l.vnum}\t${l.count}\t${l.prob}\n`);
            out += `}\n\n`;
        });
        return out;
    }

    async function fixRawText() {
        const fixed = dom.rawTextarea.value.replace(/Group\t([^\r\n]+)/g, (m, name) => {
            let n = name;
            const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
            for (let [k, v] of Object.entries(map)) n = n.split(k).join(v);
            return `Group\t${n.split(' ').join('_')}`;
        });
        dom.rawTextarea.value = fixed;
        m2Toast('Fix abgeschlossen.', 'success');
    }

    function switchTab(tab) {
        if (currentTab === tab) return;
        if (currentTab === 'visual' && tab === 'raw') currentTab = tab;
        else if (currentTab === 'raw' && tab === 'visual') { try { currentGroups = parseMobDropText(dom.rawTextarea.value); currentTab = tab; } catch(e){} }
        else if (tab === 'rates') currentTab = tab;
        currentTab = tab;
        dom.tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        dom.tabContents.forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
        refreshCurrentTab();
    }

    function refreshCurrentTab() {
        if (currentTab === 'visual') { renderGroupList(); if (currentGroups.length > 0) { if (selectedGroupIndex === -1) selectedGroupIndex = 0; selectGroup(selectedGroupIndex); } else dom.editorEmpty.classList.remove('hidden'); }
        else if (currentTab === 'rates') renderRatesTab();
        else if (currentTab === 'raw') dom.rawTextarea.value = stringifyGroups(currentGroups);
    }

    init();
})();
