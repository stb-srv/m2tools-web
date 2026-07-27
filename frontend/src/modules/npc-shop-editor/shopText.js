/* ── shop.txt parsing/generation ────────────────────────────────── */

export function parseShopText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const shops = [];
    let curr = null;

    for (let l of lines) {
        l = l.trim();
        if (!l || l.startsWith('//')) continue;
        if (l === '{') continue;
        if (l === '}') {
            if (curr) shops.push(curr);
            curr = null;
            continue;
        }

        const p = l.split(/\s+/);
        if (!curr) {
            curr = { id: l, items: [] };
        } else if (p.length >= 2 && !isNaN(p[0])) {
            curr.items.push({ vnum: p[0], count: p[1] });
        }
    }
    return shops;
}

export function stringifyShops(shops) {
    let out = '';
    shops.forEach(s => {
        out += `${s.id}\n{\n`;
        s.items.forEach(i => { out += `\t${i.vnum}\t${i.count}\n`; });
        out += `}\n\n`;
    });
    return out;
}
