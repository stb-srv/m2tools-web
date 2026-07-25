/**
 * M2-Tools – Shared Item & Icon Service
 * Zentrale Logik für Item-Namen, VNUMs und Icons (+0-9 Support)
 */

window.m2Items = {
    _items: {}, // Now using { vnum: { name, size } }
    _basePath: '/assets/items/', 

    /**
     * Initialisiert die Item-Datenbank automatisch vom Server
     */
    async autoInit() {
        try {
            const res = await window.m2Auth.authFetch('/api/admin/items');
            if (res.ok) {
                this._items = await res.json();
                console.log(`[ItemService] ${Object.keys(this._items).length} Items automatisch geladen.`);
                return true;
            }
        } catch (e) { console.warn('[ItemService] Auto-Init fehlgeschlagen.'); }
        return false;
    },

    /**
     * Manueller Import von item_names.txt
     */
    initNames(text) {
        const lines = text.split('\n');
        lines.forEach(l => {
            const parts = l.trim().split(/\t+/);
            if (parts.length >= 2) {
                const vnum = parts[0];
                if (!this._items[vnum]) this._items[vnum] = {};
                this._items[vnum].name = parts[1];
            }
        });
    },

    getName(vnum) {
        return (this._items[vnum] && this._items[vnum].name) || `VNUM ${vnum}`;
    },

    /**
     * Ermittelt die Icon-Größe (1=32x32, 2=32x64, 3=32x96)
     */
    getSize(vnum) {
        return (this._items[vnum] && this._items[vnum].size) || 1;
    },

    getBaseVnum(vnum) {
        vnum = parseInt(vnum);
        if (isNaN(vnum)) return 0;
        if (vnum >= 10 && vnum < 20000) { 
             return Math.floor(vnum / 10) * 10;
        }
        return vnum;
    },

    getIconPath(vnum) {
        if (!vnum) return null;
        const item = this._items[vnum];
        // Use mapped icon from DB if available (handle +9 logic etc.)
        const iconName = item?.icon || vnum.toString().padStart(5, '0');
        return `/assets/items/${iconName}.png`;
    },

    renderIcon(vnum, imgElement) {
        if (!imgElement) return;
        const size = this.getSize(vnum);
        
        // Verhindert endloses Flackern bei fehlenden Icons
        imgElement.onerror = () => {
            if (imgElement.dataset.failed) return;
            imgElement.dataset.failed = "true";
            imgElement.src = '/shared/assets/no_icon.png';
        };

        delete imgElement.dataset.failed;
        imgElement.src = this.getIconPath(vnum);

        if (imgElement.parentElement && imgElement.parentElement.classList.contains('it-icon-box')) {
            imgElement.parentElement.style.height = (size * 32) + 'px';
        }
    },

    /**
     * Sucht Items nach Name oder VNUM
     */
    search(query) {
        query = query.toLowerCase();
        return Object.entries(this._items)
            .filter(([vnum, data]) => vnum.includes(query) || (data.name && data.name.toLowerCase().includes(query)))
            .map(([vnum, data]) => ({ vnum, name: data.name, size: data.size }));
    }
};
