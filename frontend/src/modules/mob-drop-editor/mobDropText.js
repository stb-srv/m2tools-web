/* ── mob_drop_item.txt parsing/generation (ported ~verbatim from MobDropEditor.vue) ──────────── */

export function parseMobDropText(text) {
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
            else if (!isNaN(p[0])) curr.lines.push({ vnum: p[1], count: p[2] || '1', prob: p[3] || '1' });
        }
    }
    return groups;
}

export function stringifyGroups(groups) {
    let out = '';
    groups.forEach(g => {
        out += `Group\t${g.id}\n{\n\tMob\t${g.mob}\n\tType\t${g.type}\n`;
        g.lines.forEach((l, i) => out += `\t${i + 1}\t${l.vnum}\t${l.count}\t${l.prob}\n`);
        out += `}\n\n`;
    });
    return out;
}

const UMLAUT_MAP = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };

/**
 * Replaces umlauts with their ASCII transliteration and spaces with
 * underscores in every "Group\t<name>" line - Metin2 quest/drop-group
 * names must be plain ASCII with no spaces.
 */
export function fixRawText(text) {
    return (text || '').replace(/Group\t([^\r\n]+)/g, (m, name) => {
        let n = name;
        for (const [k, v] of Object.entries(UMLAUT_MAP)) n = n.split(k).join(v);
        return `Group\t${n.split(' ').join('_')}`;
    });
}
