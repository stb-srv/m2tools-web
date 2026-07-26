/* ── Special-item-group text parsing/generation (ported ~verbatim from SpecialItemGroup.vue) ──────────── */

export function parseSpecialItemGroup(text) {
    const lines = text.split('\n');
    const result = [];
    let currentGroup = null;

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;

        if (line.toLowerCase().startsWith('group')) {
            const parts = line.split(/\s+/);
            currentGroup = { id: Date.now() + Math.random(), name: parts[1] || 'Unknown', vnum: 0, type: 'NORMAL', comment: '', items: [] };
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

export function buildSpecialItemGroupString(groups, itemService) {
    if (groups.length === 0) return '';
    let output = '# M2-Tools Special Item Group Export\n\n';
    groups.forEach(g => {
        output += `Group\t${g.name}\n{\n`;
        if (g.vnum) output += `\tVnum\t${g.vnum}\t# ${itemService.getName(g.vnum)}\n`;
        if (g.type) output += `\tType\t${g.type}\n`;
        g.items.forEach((it, idx) => {
            const comment = it.comment || itemService.getName(it.vnum) || '';
            output += `\t${idx + 1}\t${it.vnum}\t${it.count}\t${it.prob}\t# ${comment}\n`;
        });
        output += `}\n\n`;
    });
    return output;
}

export function itemPercent(group, item) {
    const totalWeight = group.items.reduce((acc, it) => acc + (parseInt(it.prob) || 0), 0) || 1;
    return ((parseInt(item.prob) || 0) / totalWeight * 100).toFixed(1);
}
