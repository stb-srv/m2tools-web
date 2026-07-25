let recipes = [];
let currentEditingIndex = -1;
let npcNames = {};
let itemNames = {}; // Cache for item names vnum -> name

const elements = {
    newRecipeBtn: document.getElementById('new-recipe-btn'),
    importFile: document.getElementById('import-file'),
    exportBtn: document.getElementById('export-btn'),
    editorSection: document.getElementById('item-editor'),
    materialsContainer: document.getElementById('materials-container'),
    addMaterialBtn: document.getElementById('add-material-btn'),
    saveRecipeBtn: document.getElementById('save-recipe-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    recipesList: document.getElementById('recipes-list'),
    targetVnum: document.getElementById('target-vnum'),
    targetCount: document.getElementById('target-count'),
    stackWarning: document.getElementById('stack-warning'),
    yangCost: document.getElementById('yang-cost'),
    successChance: document.getElementById('success-chance'),
    npcSearch: document.getElementById('npc-search'),
    npcVnum: document.getElementById('npc-vnum'),
    selectedNpcName: document.getElementById('selected-npc-name'),
    targetPreview: document.getElementById('target-preview'),
    targetResults: document.getElementById('target-results'),
    npcResults: document.getElementById('npc-results')
};

async function init() {
    await window.m2Items.autoInit();
    setupEventListeners();
    fetchInitialCubeTxt();
}

async function fetchInitialCubeTxt() {
    try {
        const response = await fetch('/api/cube/load');
        if (!response.ok) return;
        const text = await response.text();
        recipes = parseCubeTxt(text);
        
        await resolveContextNames();
        renderRecipes();
    } catch (err) { console.warn('Starting empty.'); }
}

async function resolveContextNames() {
    const npcVnums = [...new Set(recipes.map(r => r.npc))];
    for (const vnum of npcVnums) {
        if (!npcNames[vnum]) await fetchNpcName(vnum);
    }
}

async function fetchNpcName(vnum) {
    if (!vnum) return;
    try {
        const response = await fetch(`/api/cube/npcs/search?q=${vnum}`);
        const data = await response.json();
        const match = data.find(n => n.vnum == vnum);
        if (match) npcNames[vnum] = match.name;
    } catch (e) {}
}

function setupEventListeners() {
    if (elements.newRecipeBtn) elements.newRecipeBtn.addEventListener('click', () => showEditor());
    if (elements.cancelEditBtn) elements.cancelEditBtn.addEventListener('click', hideEditor);
    if (elements.addMaterialBtn) elements.addMaterialBtn.addEventListener('click', () => addMaterialRow());
    if (elements.saveRecipeBtn) elements.saveRecipeBtn.addEventListener('click', saveRecipe);
    if (elements.importFile) elements.importFile.addEventListener('change', handleImport);
    if (elements.exportBtn) elements.exportBtn.addEventListener('click', handleExport);
    


    if (elements.targetVnum) elements.targetVnum.addEventListener('input', (e) => handleSearch(e, 'item', elements.targetResults, elements.targetPreview));
    if (elements.npcSearch) elements.npcSearch.addEventListener('input', (e) => handleSearch(e, 'npc', elements.npcResults, null, (npc) => {
        elements.npcSearch.value = npc.name;
        elements.npcVnum.value = npc.vnum;
        elements.selectedNpcName.textContent = npc.name;
        npcNames[npc.vnum] = npc.name;
    }));
    
    if (elements.targetCount) elements.targetCount.addEventListener('input', () => {
        const vnum = elements.targetVnum.value;
        checkStackability(vnum);
    });
}

function parseCubeTxt(text) {
    const blocks = text.split(/section/i);
    const parsedRecipes = [];
    blocks.forEach(block => {
        if (!block.trim() || !block.includes('end')) return;
        const recipe = { npc: 20017, items: [], reward: { vnum: 0, count: 1 }, gold: 0, percent: 100 };
        const lines = block.split('\n');
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const key = parts[0]?.toLowerCase();
            const val1 = parseInt(parts[1]);
            const val2 = parseInt(parts[2]);
            if (key === 'npc') recipe.npc = val1;
            else if (key === 'item') recipe.items.push({ vnum: val1, count: val2 || 1 });
            else if (key === 'reward') recipe.reward = { vnum: val1, count: val2 || 1 };
            else if (key === 'gold') recipe.gold = val1;
            else if (key === 'percent') recipe.percent = val1;
        });
        if (recipe.reward.vnum) parsedRecipes.push(recipe);
    });
    return parsedRecipes;
}

async function handleExport() {
    let output = "";
    recipes.forEach(recipe => {
        output += "section\n";
        output += `npc\t${recipe.npc}\n`;
        recipe.items.forEach(item => { output += `item\t${item.vnum}\t${item.count}\n`; });
        output += `reward\t${recipe.reward.vnum}\t${recipe.reward.count}\n`;
        output += `gold\t${recipe.gold}\n`;
        output += `percent\t${recipe.percent}\n`;
        output += "end\n\n";
    });
    try {
        const res = await fetch('/api/cube/save', {
            method: 'POST',
            headers: { 
                'Content-Type': 'text/plain',
                ...(window.m2Auth ? window.m2Auth.authHeaders() : {})
            },
            body: output
        });
        if (res.ok) {
            window.m2Toast('Cube.txt erfolgreich auf dem Server gespeichert!', 'success');
        } else {
            window.m2Toast('Cube.txt lokal geladen (Server nicht erreichbar)', 'warning');
        }
    } catch(err) {
        window.m2Toast('Cube.txt lokal geladen (Server nicht erreichbar)', 'warning');
    }

    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cube.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Search functionality
function handleSearch(e, type, resultsDiv, previewEl, onSelect) {
    const query = e.target.value.toLowerCase();
    if (query.length < 1) { 
        resultsDiv.innerHTML = '';
        resultsDiv.classList.add('hidden'); 
        return; 
    }

    if (type === 'item') {
        const data = window.m2Items.search(query).slice(0, 50);
        renderResults(data, resultsDiv, previewEl, onSelect);
    } else {
        // NPC search still needs API
        fetch(`/api/cube/npcs/search?q=${encodeURIComponent(query)}`)
            .then(r => r.json())
            .then(data => renderResults(data, resultsDiv, null, onSelect, true));
    }
}

function renderResults(data, resultsDiv, previewEl, onSelect, isNpc = false) {
    resultsDiv.innerHTML = '';
    if (!data || data.length === 0) { resultsDiv.classList.add('hidden'); return; }

    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-item';
        if (!isNpc) {
            div.innerHTML = `<img src="${window.m2Items.getIconPath(item.vnum)}" style="width:24px"> <span>[${item.vnum}] ${item.name}</span>`;
        } else {
            div.innerHTML = `<span><strong>[${item.vnum}]</strong> ${item.name}</span>`;
        }
        div.onclick = () => {
            resultsDiv.classList.add('hidden');
            if (onSelect) onSelect(item);
            else if (previewEl === elements.targetPreview) {
                elements.targetVnum.value = item.vnum;
                updateItemPreview(previewEl, item.vnum, item.name);
                checkStackability(item.vnum);
            }
        };
        resultsDiv.appendChild(div);
    });
    resultsDiv.classList.remove('hidden');
}

function checkStackability(vnum) {
    // Basic heuristic: Equip is not stackable
    const size = window.m2Items.getSize(vnum);
    if (parseInt(elements.targetCount.value) > 1 && size > 1) {
        elements.stackWarning.classList.remove('hidden');
    } else {
        elements.stackWarning.classList.add('hidden');
    }
}

function updateItemPreview(container, vnum, name = null) {
    const icon = container.querySelector('.item-icon') || container.querySelector('.material-preview-img');
    const nameSpan = container.querySelector('.item-name') || container.querySelector('.material-name-display');
    
    if (!vnum || vnum == 0) {
        if (nameSpan) {
            nameSpan.textContent = 'Kein Item ausgewählt';
            nameSpan.style.color = 'var(--text-muted)';
        }
        if (icon) icon.src = '/shared/assets/no_icon.png';
        return;
    }

    if (nameSpan) {
        nameSpan.textContent = `[${vnum}] ${name || window.m2Items.getName(vnum)}`;
        nameSpan.style.color = 'var(--gold-primary)';
    }
    if (icon) window.m2Items.renderIcon(vnum, icon);
}

function showEditor(index = -1) {
    currentEditingIndex = index;
    elements.editorSection.classList.remove('hidden');
    elements.materialsContainer.innerHTML = '';
    if (index === -1) {
        elements.targetVnum.value = '';
        elements.targetCount.value = 1;
        elements.yangCost.value = 0;
        elements.successChance.value = 100;
        elements.npcVnum.value = 20017;
        elements.npcSearch.value = npcNames[20017] || '';
        elements.selectedNpcName.textContent = npcNames[20017] || '20017';
        updateItemPreview(elements.targetPreview, 0);
        elements.stackWarning.classList.add('hidden');
        addMaterialRow();
    } else {
        const recipe = recipes[index];
        elements.targetVnum.value = recipe.reward.vnum;
        elements.targetCount.value = recipe.reward.count || 1;
        elements.yangCost.value = recipe.gold;
        elements.successChance.value = recipe.percent;
        elements.npcVnum.value = recipe.npc;
        elements.npcSearch.value = npcNames[recipe.npc] || '';
        elements.selectedNpcName.textContent = npcNames[recipe.npc] || recipe.npc;
        updateItemPreview(elements.targetPreview, recipe.reward.vnum);
        checkStackability(recipe.reward.vnum);
        recipe.items.forEach(item => addMaterialRow(item.vnum, item.count));
    }
    elements.editorSection.scrollIntoView({ behavior: 'smooth' });
}

function hideEditor() { elements.editorSection.classList.add('hidden'); currentEditingIndex = -1; }

function addMaterialRow(vnum = '', count = 1) {
    if (elements.materialsContainer.children.length >= 5) return;
    const template = document.getElementById('material-row-template');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.material-row');
    const input = row.querySelector('.material-vnum');
    const countInput = row.querySelector('.material-count');
    const resultsDiv = row.querySelector('.search-results');
    const removeBtn = row.querySelector('.remove-material-btn');

    input.value = vnum;
    countInput.value = count;

    updateItemPreview(row, vnum);

    input.addEventListener('input', (e) => handleSearch(e, 'item', resultsDiv, row, (item) => {
        input.value = item.vnum;
        updateItemPreview(row, item.vnum, item.name);
    }));

    removeBtn.addEventListener('click', () => row.remove());
    elements.materialsContainer.appendChild(row);
}

function saveRecipe() {
    const targetVnum = elements.targetVnum.value;
    if (!targetVnum) return window.m2Toast('Bitte Ziel-Item auswählen!', 'warning');
    const recipe = {
        npc: parseInt(elements.npcVnum.value),
        reward: { vnum: parseInt(targetVnum), count: parseInt(elements.targetCount.value) || 1 },
        gold: parseInt(elements.yangCost.value),
        percent: parseInt(elements.successChance.value),
        items: []
    };
    elements.materialsContainer.querySelectorAll('.material-row').forEach(row => {
        const vnum = parseInt(row.querySelector('.material-vnum').value);
        const count = parseInt(row.querySelector('.material-count').value);
        if (vnum) recipe.items.push({ vnum, count });
    });
    if (currentEditingIndex === -1) recipes.push(recipe);
    else recipes[currentEditingIndex] = recipe;
    renderRecipes();
    hideEditor();
}

async function renderRecipes() {
    const htmlPromises = recipes.map(async (recipe, index) => {
        const rewardName = window.m2Items.getName(recipe.reward.vnum);
        const displayedRewardName = `${recipe.reward.count > 1 ? recipe.reward.count + 'x ' : ''}[${recipe.reward.vnum}] ${rewardName}`;
        const npcDisplay = npcNames[recipe.npc] || `NPC: ${recipe.npc}`;
        const iconPath = window.m2Items.getIconPath(recipe.reward.vnum);
        const size = window.m2Items.getSize(recipe.reward.vnum);
        
        const matsHtml = recipe.items.map(m => {
            const mName = window.m2Items.getName(m.vnum);
            const mIcon = window.m2Items.getIconPath(m.vnum);
            return `
                <div class="recipe-mat" title="[${m.vnum}] ${mName}">
                    <img src="${mIcon}" class="item-icon small">
                    <span class="mat-info"><span class="mat-count">${m.count}x</span> [${m.vnum}]</span>
                </div>
            `;
        }).join('');

        return `
        <div class="recipe-card">
            <div class="recipe-header">
                <div class="recipe-title">
                    <div class="it-icon-box" style="height:${size*32}px; width:32px; overflow:hidden">
                        <img src="${iconPath}" class="item-icon">
                    </div>
                    <div>
                        <div class="item-name">${displayedRewardName}</div>
                        <div class="npc-subtext">${npcDisplay}</div>
                    </div>
                </div>
                <div class="recipe-chance">${recipe.percent}%</div>
            </div>
            <div class="recipe-details">
                <div class="recipe-cost">💰 ${recipe.gold.toLocaleString()} Yang</div>
                <div class="recipe-mats-label">Materialien:</div>
                <div class="recipe-mats">${matsHtml}</div>
            </div>
            <div class="recipe-actions">
                <button class="m2-btn m2-btn-secondary small" onclick="editRecipe(${index})">Edit</button>
                <button class="m2-btn m2-btn-secondary small delete-btn" onclick="deleteRecipe(${index})">X</button>
            </div>
        </div>`;
    });
    const cards = await Promise.all(htmlPromises);
    elements.recipesList.innerHTML = cards.join('');
}

window.editRecipe = (index) => showEditor(index);
window.deleteRecipe = (index) => { 
    window.m2Confirm('Löschen?', 'Rezept wirklich löschen?', () => {
        recipes.splice(index, 1); 
        renderRecipes(); 
    });
};

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => { 
        recipes = parseCubeTxt(event.target.result); 
        await resolveContextNames();
        renderRecipes(); 
    };
    reader.readAsText(file);
}

init();
