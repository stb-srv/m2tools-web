/* ── cube.txt parsing/generation (ported ~verbatim from CubeEditor.vue) ──────────── */

export function parseCubeTxt(text) {
    const blocks = text.split(/section/i);
    const parsed = [];
    blocks.forEach(block => {
        if (!block.trim() || !block.includes('end')) return;
        const recipe = { npc: 20017, items: [], reward: { vnum: 0, count: 1 }, gold: 0, percent: 100 };
        block.split('\n').forEach(line => {
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
        if (recipe.reward.vnum) parsed.push(recipe);
    });
    return parsed;
}

export function buildCubeTxt(recipes) {
    let output = '';
    recipes.forEach(recipe => {
        output += 'section\n';
        output += `npc\t${recipe.npc}\n`;
        recipe.items.forEach(item => { output += `item\t${item.vnum}\t${item.count}\n`; });
        output += `reward\t${recipe.reward.vnum}\t${recipe.reward.count}\n`;
        output += `gold\t${recipe.gold}\n`;
        output += `percent\t${recipe.percent}\n`;
        output += 'end\n\n';
    });
    return output;
}
