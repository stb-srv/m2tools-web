/* ── regen.txt parsing/generation ──────────────────────────────────
 * Group/{ }/Vnum idiom mirroring mob_drop_item.txt's own Group blocks
 * (see mob-drop-editor/mobDropText.js) - Metin2 core forks don't all
 * agree on one canonical regen.txt syntax, so this covers the common
 * shape; raw-text mode in the editor always round-trips regardless. */

export function parseRegenText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const groups = [];
    let curr = null;
    for (let l of lines) {
        l = l.trim();
        if (!l || l.startsWith('//')) continue;
        if (l.toLowerCase().startsWith('group')) {
            const name = l.substring(5).trim();
            curr = { id: name, vnum: '0', points: [] };
            continue;
        }
        if (l === '{') continue;
        if (l === '}' && curr) { groups.push(curr); curr = null; continue; }
        if (curr) {
            const p = l.split(/\s+/);
            if (p[0] === 'Vnum') curr.vnum = p[1] || '0';
            else if (!isNaN(p[0])) curr.points.push({ x: p[0], y: p[1] || '0', direction: p[2] || '0' });
        }
    }
    return groups;
}

export function stringifyGroups(groups) {
    let out = '';
    groups.forEach(g => {
        out += `Group\t${g.id}\n{\n\tVnum\t${g.vnum}\n`;
        g.points.forEach(p => { out += `\t${p.x}\t${p.y}\t${p.direction}\n`; });
        out += `}\n\n`;
    });
    return out;
}
