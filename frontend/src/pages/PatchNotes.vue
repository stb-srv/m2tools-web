<script setup>
import { ref, computed, onMounted } from 'vue';

const allChunks = ref([]);
const modules = ref([]);
const activeModule = ref('all');
const loadError = ref(false);

const TYPE_ICONS = { feature: '✨', fix: '🛠️', improvement: '🚀' };
const TYPE_LABELS = { feature: 'Feature', fix: 'Fix', improvement: 'Optimierung' };

const filterModules = computed(() => modules.value.filter(m => m.id !== 'item_manager'));

const filteredEntries = computed(() => {
    const list = activeModule.value === 'all' ? allChunks.value : allChunks.value.filter(c => c.moduleId === activeModule.value);
    return list;
});

async function loadChangelogs() {
    try {
        const modRes = await fetch('/api/auth/modules/status');
        modules.value = await modRes.json();

        const res = await fetch('/api/admin/changelogs');
        const chunks = await res.json();
        chunks.sort((a, b) => new Date(b.date) - new Date(a.date));
        allChunks.value = chunks;
    } catch {
        loadError.value = true;
    }
}

onMounted(loadChangelogs);
</script>

<template>
    <div class="patch-container">
        <div style="margin-bottom: 20px;">
            <router-link to="/index.html" class="m2-btn m2-btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">⬅ Dashboard</router-link>
        </div>

        <header class="patch-header">
            <h1>PATCH <span class="accent">NOTES</span></h1>
            <p>Bleib auf dem Laufenden über die neuesten Funktionen und Verbesserungen.</p>
        </header>

        <nav class="patch-filters">
            <button class="filter-btn" :class="{ active: activeModule === 'all' }" @click="activeModule = 'all'">Alle Updates</button>
            <button v-for="m in filterModules" :key="m.id" class="filter-btn" :class="{ active: activeModule === m.id }" @click="activeModule = m.id">
                {{ m.name }}
            </button>
        </nav>

        <section class="timeline">
            <div v-if="loadError" style="color:var(--danger)">Protokolle konnten nicht geladen werden.</div>
            <div v-else-if="filteredEntries.length === 0" style="text-align:center; padding: 40px; color: var(--text-muted)">Keine Einträge gefunden.</div>
            <div v-for="(item, index) in filteredEntries" :key="index" class="patch-entry" :style="{ animationDelay: index * 0.1 + 's' }">
                <div class="patch-dot"></div>
                <div class="patch-card">
                    <div class="patch-meta">
                        <span class="patch-module-tag">{{ item.moduleId.replace(/_/g, ' ') }}</span>
                        <span>{{ new Date(item.date).toLocaleDateString('de-DE') }}</span>
                    </div>
                    <div class="patch-title-row">
                        <span class="patch-version">v{{ item.version }}</span>
                        <span class="patch-title">{{ item.title }}</span>
                        <span class="patch-type-pill" :class="`type-${item.type}`">
                            {{ TYPE_ICONS[item.type] || '📝' }} {{ TYPE_LABELS[item.type] || item.type }}
                        </span>
                    </div>
                    <div class="patch-content">{{ item.content }}</div>
                </div>
            </div>
        </section>
    </div>
</template>

<style scoped>
.patch-container { max-width: 1000px; margin: 40px auto; padding: 0 20px; }

.patch-header { text-align: center; margin-bottom: 60px; }
.patch-header h1 { font-size: 3rem; font-family: var(--font-heading); color: var(--text-heading); margin-bottom: 10px; }
.patch-header h1 .accent { color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow); }
.patch-header p { color: var(--text-secondary); font-size: 1.1rem; }

.patch-filters { display: flex; justify-content: center; gap: 15px; margin-bottom: 40px; flex-wrap: wrap; }
.filter-btn {
    background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-secondary);
    padding: 8px 20px; border-radius: 20px; cursor: pointer; transition: all 0.3s; font-size: 0.9rem;
}
.filter-btn:hover { border-color: var(--gold-primary); color: var(--text-heading); }
.filter-btn.active { background: var(--gold-primary); color: #000; border-color: var(--gold-primary); font-weight: 600; }

.timeline { position: relative; padding-left: 50px; }
.timeline::before {
    content: ''; position: absolute; left: 20px; top: 0; bottom: 0; width: 2px;
    background: linear-gradient(to bottom, var(--gold-primary), transparent);
}

.patch-entry { position: relative; margin-bottom: 50px; animation: slideIn 0.5s ease-out forwards; opacity: 0; }
@keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }

.patch-dot {
    position: absolute; left: -38px; top: 5px; width: 16px; height: 16px;
    background: var(--bg-main, var(--bg-body)); border: 3px solid var(--gold-primary); border-radius: 50%;
    z-index: 2; box-shadow: 0 0 10px var(--gold-glow);
}

.patch-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 25px; backdrop-filter: blur(10px); transition: transform 0.3s; }
.patch-card:hover { transform: translateY(-5px); border-color: rgba(212, 175, 55, 0.3); }

.patch-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-size: 0.85rem; color: var(--text-muted); }
.patch-module-tag { background: rgba(212, 175, 55, 0.1); color: var(--gold-primary); padding: 4px 12px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }

.patch-title-row { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
.patch-version { font-size: 1.5rem; font-weight: 800; color: var(--gold-primary); font-family: var(--font-heading); }
.patch-title { font-size: 1.4rem; font-weight: 600; color: var(--text-heading); }

.patch-type-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
.type-feature { background: #4CAF50; color: white; }
.type-fix { background: #2196F3; color: white; }
.type-improvement { background: #9C27B0; color: white; }

.patch-content { color: var(--text-secondary); line-height: 1.6; font-size: 1rem; }

@media (max-width: 768px) {
    .patch-title-row { flex-direction: column; align-items: flex-start; gap: 5px; }
    .patch-header h1 { font-size: 2.2rem; }
}
</style>
