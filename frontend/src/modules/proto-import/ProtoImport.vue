<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const TABS = [
    { type: 'item', label: 'Items (item_proto)' },
    { type: 'mob', label: 'Mobs (mob_proto)' }
];

const currentType = ref('item');
const text = ref('');
const importing = ref(false);
const stats = ref({ items: 0, mobs: 0, dbType: 'SQLite' });

const placeholder = computed(() => (
    currentType.value === 'item'
        ? 'Inhalt der item_proto.txt hier einfügen...'
        : 'Inhalt der mob_proto.txt hier einfügen...'
));

async function loadStats() {
    try {
        const res = await auth.authFetch('/api/proto/stats');
        stats.value = await res.json();
    } catch (err) {
        console.error('[ProtoImport] Stats load error:', err);
    }
}

async function doImport() {
    const trimmed = text.value.trim();
    if (!trimmed) {
        ui.toast('Kein Inhalt zum Importieren.', 'warning');
        return;
    }

    importing.value = true;
    try {
        const endpoint = currentType.value === 'item' ? '/api/proto/items' : '/api/proto/mobs';
        const res = await auth.authFetch(endpoint, { method: 'POST', body: JSON.stringify({ text: trimmed }) });
        const result = await res.json();
        if (result.success) {
            ui.toast(`${result.imported} von ${result.total} Einträgen importiert!`, 'success');
            text.value = '';
            loadStats();
        } else {
            ui.toast('Fehler: ' + (result.error || 'Unbekannter Fehler'), 'error');
        }
    } catch (err) {
        console.error(err);
        ui.toast('Netzwerkfehler beim Import.', 'error');
    } finally {
        importing.value = false;
    }
}

loadStats();
</script>

<template>
    <div class="page-header">
        <h1>PROTO <span class="gold">IMPORTER</span></h1>
        <p>Importiere deine eigene item_proto oder mob_proto</p>
    </div>

    <div class="import-container">
        <div class="import-card">
            <div class="tabs">
                <div
                    v-for="tab in TABS"
                    :key="tab.type"
                    class="tab"
                    :class="{ active: currentType === tab.type }"
                    @click="currentType = tab.type"
                >
                    {{ tab.label }}
                </div>
            </div>

            <textarea v-model="text" class="proto-textarea" :placeholder="placeholder"></textarea>

            <div style="display: flex; gap: 15px;">
                <button class="m2-btn m2-btn-primary" style="flex: 1;" :disabled="importing" @click="doImport">
                    {{ importing ? '⌛ Importiert...' : '⚡ Import starten' }}
                </button>
                <button class="m2-btn m2-btn-secondary" @click="text = ''">🧹 Leeren</button>
            </div>

            <div class="info-box">
                <strong>Tipp:</strong> Du kannst den Inhalt deiner <code>item_proto.txt</code> (aus dem Client-Dump) hier einfach reinkopieren.
                Das System erkennt automatisch die Spalten für VNUM, Name, Type, Subtype und Flag.
            </div>
        </div>

        <aside>
            <div class="stats-card">
                <h3>Datenbank-Statistik</h3>
                <div class="stat-row">
                    <span class="stat-label">Items gesamt:</span>
                    <span class="stat-val">{{ stats.items || 0 }}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Mobs gesamt:</span>
                    <span class="stat-val">{{ stats.mobs || 0 }}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">DB Typ:</span>
                    <span class="stat-val">{{ stats.dbType || 'Unknown' }}</span>
                </div>
            </div>
        </aside>
    </div>
</template>

<style scoped>
.page-header { margin-bottom: 30px; text-align: center; }
.page-header h1 { font-family: var(--font-heading); font-size: 2.5rem; color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow); }
.page-header p { color: var(--text-secondary); margin-top: 5px; }

.import-container {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 25px;
}

.import-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 30px;
    backdrop-filter: blur(15px);
}

.tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; }
.tab {
    padding: 10px 20px; border-radius: 6px; cursor: pointer; color: var(--text-secondary); transition: all 0.3s;
    border: 1px solid transparent; background: var(--bg-hover);
}
.tab.active { background: var(--bg-input); color: var(--gold-primary); border-color: var(--gold-primary); box-shadow: 0 0 10px rgba(181, 149, 81, 0.1); }

.proto-textarea {
    width: 100%;
    height: 400px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 15px;
    color: var(--text-primary);
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    resize: vertical;
    margin-bottom: 20px;
    outline: none;
}
.proto-textarea:focus { border-color: var(--gold-primary); }

.stats-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 20px;
    height: fit-content;
}
.stats-card h3 { font-family: var(--font-heading); margin-bottom: 15px; color: var(--gold-primary); font-size: 1.1rem; }

.stat-row { display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); }
.stat-label { color: var(--text-secondary); font-size: 0.9rem; }
.stat-val { font-weight: 700; color: var(--text-primary); }

.info-box {
    margin-top: 20px; padding: 15px; background: rgba(181, 149, 81, 0.05); border-left: 3px solid var(--gold-primary);
    font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4;
}
</style>
