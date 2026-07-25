import { reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Ports public/shared/item_service.js. Module-level singleton (not a
 * Pinia store) - it's a cached vnum->{name,size,icon} lookup table
 * shared across modules, no need for Pinia's devtools/plugin machinery.
 */
const items = reactive({});

async function autoInit() {
    const auth = useAuthStore();
    try {
        const res = await auth.authFetch('/api/admin/items');
        if (res.ok) {
            const data = await res.json();
            Object.keys(items).forEach(k => delete items[k]);
            Object.assign(items, data);
            console.log(`[ItemService] ${Object.keys(items).length} Items automatisch geladen.`);
            return true;
        }
    } catch (e) {
        console.warn('[ItemService] Auto-Init fehlgeschlagen.');
    }
    return false;
}

function initNames(text) {
    text.split('\n').forEach(l => {
        const parts = l.trim().split(/\t+/);
        if (parts.length >= 2) {
            const vnum = parts[0];
            if (!items[vnum]) items[vnum] = {};
            items[vnum].name = parts[1];
        }
    });
}

function getName(vnum) {
    return (items[vnum] && items[vnum].name) || `VNUM ${vnum}`;
}

function getSize(vnum) {
    return (items[vnum] && items[vnum].size) || 1;
}

function getBaseVnum(vnum) {
    vnum = parseInt(vnum);
    if (isNaN(vnum)) return 0;
    if (vnum >= 10 && vnum < 20000) return Math.floor(vnum / 10) * 10;
    return vnum;
}

function getIconPath(vnum) {
    if (!vnum) return null;
    const item = items[vnum];
    const iconName = item?.icon || vnum.toString().padStart(5, '0');
    return `/assets/items/${iconName}.png`;
}

function search(query) {
    const q = query.toLowerCase();
    return Object.entries(items)
        .filter(([vnum, data]) => vnum.includes(q) || (data.name && data.name.toLowerCase().includes(q)))
        .map(([vnum, data]) => ({ vnum, name: data.name, size: data.size }));
}

export function useItemService() {
    return { items, autoInit, initNames, getName, getSize, getBaseVnum, getIconPath, search };
}
