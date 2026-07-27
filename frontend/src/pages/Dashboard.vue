<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();
const modules = ref([]);

function tagInfo(m) {
    if (m.access_level === 'public') return { label: '🌐 Öffentlich', class: 'public' };
    if (m.access_level === 'premium') return { label: '🌟 Premium', class: 'premium' };
    if (m.access_level === 'user') return { label: '👤 Account benötigt', class: 'user' };
    return null;
}

function isNew(m) {
    if (!m.created_at) return false;
    const created = new Date(m.created_at);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return created > threeMonthsAgo;
}

const visibleModules = computed(() => modules.value.filter(m => {
    if (m.id === 'item_manager' || m.id === 'server_connections') return false;
    if (m.access_level === 'admin' && auth.user?.role !== 'admin') return false;
    if (!auth.user && !m.is_visible_guests) return false;
    return true;
}));

// Same grouping/ordering as the Admin panel's Modul-Berechtigungen table -
// with a growing tool count a single flat grid stops being scannable, so
// this breaks it into the same categories admins already assign per module.
const CATEGORY_ORDER = ['System', 'Admin', 'Database', 'Development'];
const activeCategory = ref('Alle');

const categories = computed(() => {
    const set = new Set(visibleModules.value.map(m => m.category || 'Sonstiges'));
    return Array.from(set).sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a);
        const bi = CATEGORY_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });
});

const groupedModules = computed(() => {
    const groups = {};
    for (const m of visibleModules.value) {
        const cat = m.category || 'Sonstiges';
        if (activeCategory.value !== 'Alle' && cat !== activeCategory.value) continue;
        (groups[cat] = groups[cat] || []).push(m);
    }
    return categories.value
        .filter(cat => groups[cat])
        .map(cat => ({ category: cat, items: groups[cat] }));
});

function onTileClick(m, e) {
    if (auth.canAccess(m.access_level)) return;
    e.preventDefault();
    if (!auth.user) ui.alert('Zutritt verweigert', 'Anmeldung erforderlich.');
    else if (m.access_level === 'premium') ui.alert('Premium benötigt', 'Dieser Bereich ist nur für Premium-Nutzer.');
    else ui.alert('Kein Zugriff', 'Du hast keine Berechtigung für dieses Modul.');
}

onMounted(async () => {
    modules.value = await auth.fetchModuleStatus();
});
</script>

<template>
    <header>
        <h1>M2 <span class="accent">TOOLS</span></h1>
        <p class="subtitle">Modulare Metin2 Entwickler-Werkzeuge</p>
    </header>

    <div class="category-filter">
        <button class="cat-chip" :class="{ active: activeCategory === 'Alle' }" @click="activeCategory = 'Alle'">Alle</button>
        <button v-for="cat in categories" :key="cat" class="cat-chip" :class="{ active: activeCategory === cat }" @click="activeCategory = cat">{{ cat }}</button>
    </div>

    <div v-for="group in groupedModules" :key="group.category" class="category-section">
        <h2 class="category-heading">{{ group.category }}</h2>
        <div class="dashboard-grid">
            <router-link
                v-for="m in group.items"
                :key="m.id"
                :to="auth.canAccess(m.access_level) ? m.url : '#'"
                class="tile"
                :class="{ disabled: !auth.canAccess(m.access_level) }"
                @click="onTileClick(m, $event)"
            >
                <div class="tile-status">
                    <span v-if="tagInfo(m)" class="tag" :class="tagInfo(m).class">{{ tagInfo(m).label }}</span>
                </div>
                <div class="tile-new">
                    <span v-if="isNew(m)" class="tag new">NEU</span>
                    <span class="tag version">{{ m.version || 'v1.0.0' }}</span>
                </div>
                <div v-if="!auth.canAccess(m.access_level)" class="tile-lock">🔒</div>
                <div class="tile-icon">{{ m.icon || '🛠️' }}</div>
                <div class="tile-title">{{ m.name }}</div>
                <div class="tile-desc">{{ m.desc }}</div>
            </router-link>
        </div>
    </div>
</template>

<style scoped>
header { text-align: center; padding: 40px 20px 40px; position: relative; width: 100%; max-width: 1200px; margin: 0 auto; }
header h1 { font-size: 3.5rem; letter-spacing: 2px; font-family: var(--font-heading); color: var(--text-heading); }
header h1 .accent { color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow); }
.subtitle { font-size: 1.1rem; color: var(--text-secondary); margin-top: 10px; letter-spacing: 1px; }

.category-filter {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
    max-width: 1200px; width: 100%; padding: 0 20px 10px;
}
.cat-chip {
    background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-secondary);
    padding: 8px 18px; border-radius: 999px; font-size: 0.85rem; font-weight: 600;
    cursor: pointer; transition: var(--transition); letter-spacing: 0.3px;
}
.cat-chip:hover { border-color: var(--gold-border); color: var(--text-primary); }
.cat-chip.active { background: var(--gold-primary); color: #000; border-color: var(--gold-primary); }

.category-section { width: 100%; max-width: 1200px; margin: 0 auto; padding: 10px 0; }
.category-heading {
    font-family: var(--font-heading); font-size: 1.2rem; letter-spacing: 2px; text-transform: uppercase;
    color: var(--gold-primary); padding: 0 20px 15px; opacity: 0.9;
}

.dashboard-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px; width: 100%; padding: 0 20px 20px;
}

.tile {
    background: var(--bg-card); border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 50px 30px; text-align: center;
    text-decoration: none; color: inherit;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center;
    backdrop-filter: blur(15px);
    animation: tileAppear 0.5s ease forwards;
}
.tile::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, transparent, var(--gold-accent), transparent);
    opacity: 0; transition: opacity 0.4s;
}
.tile:hover { transform: translateY(-10px); border-color: var(--gold-primary); box-shadow: 0 15px 35px rgba(0,0,0,0.5), var(--shadow-gold); }
.tile:hover::before { opacity: 1; }
.tile-icon { font-size: 3.5rem; margin-bottom: 25px; color: var(--gold-primary); filter: drop-shadow(0 0 10px var(--gold-glow)); }
.tile-title { font-family: var(--font-heading); font-size: 1.6rem; margin-bottom: 12px; color: var(--text-heading); }
.tile-desc { font-size: 1rem; color: var(--text-secondary); line-height: 1.6; }

.tile.disabled { opacity: 0.3; cursor: not-allowed; filter: grayscale(1); }
.tile.disabled:hover { transform: none; border-color: var(--border-color); box-shadow: none; }

.tag {
    font-size: 0.7rem;
    text-transform: uppercase; padding: 4px 10px; font-weight: 700;
    border-radius: 4px; letter-spacing: 0.5px;
    display: inline-block;
}
.tag.public { background: #2196F3; color: #fff; }
.tag.new { background: var(--success); color: #fff; }
.tag.premium { background: var(--gold-primary); color: #000; }
.tag.user { background: rgba(255,255,255,0.1); color: var(--text-secondary); border: 1px solid var(--border-color); }
.tag.version { background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid var(--border-color); font-family: var(--font-mono); }

.tile-status { position: absolute; top: 15px; left: 15px; }
.tile-new { position: absolute; top: 15px; right: 15px; display: flex; gap: 6px; align-items: center; }
.tile-lock { position: absolute; top: 10px; left: 10px; font-size: 1.2rem; }

@keyframes tileAppear { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
</style>
