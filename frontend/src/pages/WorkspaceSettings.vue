<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const wsId = route.query.id;

const workspace = ref(null);
const fileInputs = { db: ref(null), icons: ref(null), item_proto: ref(null), mob_proto: ref(null) };
const uploadProgress = ref({ db: null, icons: null, item_proto: null, mob_proto: null });

const UPLOAD_TYPES = [
    { type: 'db', icon: '🗄️', title: 'proto.db', desc: 'SQLite Format (item_proto, mob_proto)', accept: '.db' },
    { type: 'icons', icon: '🖼️', title: 'icons.zip', desc: 'ZIP mit .png oder .tga Dateien', accept: '.zip' },
    { type: 'item_proto', icon: '📜', title: 'item_proto.txt', desc: 'Tab-separierte item_proto.txt', accept: '.txt' },
    { type: 'mob_proto', icon: '🐉', title: 'mob_proto.txt', desc: 'Tab-separierte mob_proto.txt', accept: '.txt' }
];

async function loadDetails() {
    try {
        const res = await auth.authFetch(`/api/workspaces/${wsId}`);
        if (!res.ok) throw new Error('Workspace nicht gefunden');
        workspace.value = await res.json();
    } catch (e) {
        ui.toast('Fehler: ' + e.message, 'error');
        setTimeout(() => router.push('/workspaces.html'), 2000);
    }
}

async function uploadFile(type, e) {
    const file = e.target.files[0];
    if (!file) return;

    uploadProgress.value[type] = 0;
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch(`/api/workspaces/${wsId}/upload/${type}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.token}` },
            body: formData
        });
        const result = await res.json();
        if (res.ok) {
            uploadProgress.value[type] = 100;
            const messages = {
                db: 'Datenbank erfolgreich hochgeladen!',
                icons: 'Icons erfolgreich hochgeladen!',
                item_proto: 'item_proto.txt erfolgreich hochgeladen!',
                mob_proto: 'mob_proto.txt erfolgreich hochgeladen!'
            };
            ui.toast(messages[type], 'success');
        } else {
            throw new Error(result.error || 'Upload fehlgeschlagen');
        }
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        setTimeout(() => { uploadProgress.value[type] = null; }, 2000);
        e.target.value = '';
    }
}

onMounted(() => {
    if (!wsId) { router.push('/workspaces.html'); return; }
    loadDetails();
});
</script>

<template>
    <div class="settings-container">
        <div style="margin-bottom: 20px;">
            <router-link to="/workspaces.html" class="m2-btn m2-btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:8px;">⬅ Workspaces List</router-link>
        </div>

        <div class="settings-header">
            <div class="m2-avatar" style="width: 60px; height: 60px; font-size: 1.5rem;">{{ workspace ? workspace.name.charAt(0).toUpperCase() : 'W' }}</div>
            <div>
                <h1>{{ workspace?.name || 'Workspace Settings' }}</h1>
                <p style="color: var(--text-muted); font-size: 0.9rem;">
                    {{ workspace ? `ID: ${workspace.id} • Erstellt: ${new Date(workspace.created_at).toLocaleDateString()}` : 'ID: -' }}
                </p>
            </div>
        </div>

        <div class="settings-card">
            <h2 style="font-size: 1.2rem; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">📂 Sachen Hochladen</h2>
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 25px;">
                Lade hier deine Spieldaten hoch, um sie in den Editoren zu verwenden.
            </p>

            <div class="upload-section">
                <div v-for="ut in UPLOAD_TYPES" :key="ut.type" class="upload-box" @click="fileInputs[ut.type].value.click()">
                    <input :ref="el => fileInputs[ut.type].value = el" type="file" class="hidden-file" :accept="ut.accept" @change="uploadFile(ut.type, $event)">
                    <div style="font-size: 2rem; margin-bottom: 10px;">{{ ut.icon }}</div>
                    <strong>{{ ut.title }}</strong><br>
                    <span>{{ ut.desc }}</span>
                    <div v-if="uploadProgress[ut.type] !== null" class="progress-container" style="display:block;">
                        <div class="progress-bar"><div class="progress-fill" :style="{ width: uploadProgress[ut.type] + '%' }"></div></div>
                    </div>
                </div>
            </div>
        </div>

        <div class="settings-card">
            <h2 style="font-size: 1.2rem; margin-bottom: 20px;">Workspace Details</h2>
            <div class="m2-field-group">
                <label>Name</label>
                <input :value="workspace?.name" type="text" class="m2-input" readonly>
            </div>
            <div class="m2-field-group" style="margin-top: 15px;">
                <label>Beschreibung</label>
                <textarea :value="workspace?.description || ''" class="m2-input" style="height: 60px;" readonly></textarea>
            </div>
        </div>
    </div>
</template>

<style scoped>
.settings-container { max-width: 800px; margin: 40px auto; padding: 0 20px; }

.settings-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 30px;
    margin-bottom: 30px;
}

.settings-header { display: flex; align-items: center; gap: 20px; margin-bottom: 40px; }
.settings-header h1 { font-size: 2.2rem; color: var(--gold-primary); margin: 0; }

.upload-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }

.upload-box {
    background: var(--bg-hover);
    border: 2px dashed var(--border-color);
    border-radius: var(--radius-sm);
    padding: 20px;
    text-align: center;
    transition: var(--transition);
    cursor: pointer;
}
.upload-box:hover { border-color: var(--gold-primary); background: rgba(212, 175, 55, 0.05); }
.upload-box span { font-size: 0.9rem; color: var(--text-secondary); }

.hidden-file { display: none; }

.progress-container { margin-top: 10px; }
.progress-bar { height: 4px; background: var(--bg-input); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--gold-primary); transition: width 0.3s; }
</style>
