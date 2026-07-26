<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useServerConnection } from '@/composables/useServerConnection';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const wsId = route.query.id;
const wsIdRef = ref(wsId);

const canUseConnections = auth.canAccess('premium');
const conn = useServerConnection(wsIdRef);

const form = ref({
    ssh_host: '', ssh_port: 22, ssh_username: '', ssh_auth_method: 'password',
    ssh_secret: '', ssh_passphrase: '',
    remote_quest_path: '', remote_cube_path: '',
    cmd_restart_game: '', cmd_restart_db: '', cmd_status: '',
    db_host: '', db_port: 3306, db_user: '', db_name: '', db_password: ''
});
const testResult = ref(null);
const testing = ref(false);
const saving = ref(false);
const syncing = ref(false);
const runningCommand = ref(null);

function applyConnectionToForm(c) {
    if (!c) return;
    form.value.ssh_host = c.ssh_host || '';
    form.value.ssh_port = c.ssh_port || 22;
    form.value.ssh_username = c.ssh_username || '';
    form.value.ssh_auth_method = c.ssh_auth_method || 'password';
    form.value.remote_quest_path = c.remote_quest_path || '';
    form.value.remote_cube_path = c.remote_cube_path || '';
    form.value.cmd_restart_game = c.cmd_restart_game || '';
    form.value.cmd_restart_db = c.cmd_restart_db || '';
    form.value.cmd_status = c.cmd_status || '';
    form.value.db_host = c.db_host || '';
    form.value.db_port = c.db_port || 3306;
    form.value.db_user = c.db_user || '';
    form.value.db_name = c.db_name || '';
    // Secret fields stay empty - the API never returns them. Non-empty
    // placeholders (below, in the template) signal "already set".
}

async function loadConnection() {
    if (!canUseConnections) return;
    await conn.load();
    applyConnectionToForm(conn.connection.value);
    await conn.loadAuditLog();
}

async function saveConnection() {
    saving.value = true;
    try {
        await conn.save({ ...form.value });
        applyConnectionToForm(conn.connection.value);
        form.value.ssh_secret = '';
        form.value.ssh_passphrase = '';
        form.value.db_password = '';
        ui.toast('Verbindung gespeichert', 'success');
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        saving.value = false;
    }
}

async function testConnectionNow() {
    testing.value = true;
    testResult.value = null;
    try {
        testResult.value = await conn.test();
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        testing.value = false;
    }
}

async function runCommand(key, label) {
    const confirmed = await ui.confirm(label, `"${label}" auf dem echten Server ausführen?`);
    if (!confirmed) return;
    runningCommand.value = key;
    try {
        const result = await conn.runCommand(key);
        ui.toast(`${label}: ${result.stdout?.trim() || 'OK'}`, 'success');
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        runningCommand.value = null;
        await conn.loadAuditLog();
    }
}

async function syncDb(direction) {
    syncing.value = true;
    try {
        const result = direction === 'pull' ? await conn.dbPull() : await conn.dbPush();
        ui.toast(`${result.itemsWritten} Items, ${result.mobsWritten} Mobs synchronisiert`, 'success');
    } catch (err) {
        ui.toast(err.message, 'error');
    } finally {
        syncing.value = false;
        await conn.loadAuditLog();
    }
}

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
    loadConnection();
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

        <div class="settings-card">
            <h2 style="font-size: 1.2rem; margin-bottom: 10px; display: flex; align-items: center; gap: 10px;">
                🔌 Server-Verbindung
                <span v-if="canUseConnections" class="status-badge badge-premium" style="font-size: 0.7rem;">Premium</span>
            </h2>

            <div v-if="!canUseConnections" style="text-align: center; padding: 30px 0; color: var(--text-secondary);">
                <div style="font-size: 2rem; margin-bottom: 10px;">🔒</div>
                <p>Direkte SSH/SFTP- und Live-Datenbank-Verbindung zu deinem eigenen Metin2-Server ist ein Premium-Feature.</p>
            </div>

            <div v-else>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">
                    Verbinde diesen Workspace mit deinem eigenen Server, um Quests/Cube-Rezepte direkt zu deployen und
                    item_proto/mob_proto live zu synchronisieren. Zugangsdaten werden verschlüsselt gespeichert und nie wieder im Klartext angezeigt.
                </p>

                <h3 style="font-size: 1rem; color: var(--gold-primary); margin-bottom: 15px;">SSH / SFTP</h3>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">Host</label>
                        <input v-model="form.ssh_host" type="text" class="m2-input" placeholder="z.B. 123.45.67.89">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Port</label>
                        <input v-model.number="form.ssh_port" type="number" class="m2-input" placeholder="22">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">Benutzername</label>
                        <input v-model="form.ssh_username" type="text" class="m2-input" placeholder="root">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Auth-Methode</label>
                        <select v-model="form.ssh_auth_method" class="m2-select-admin" style="width: 100%; padding: 14px 15px;">
                            <option value="password">Passwort</option>
                            <option value="key">Private Key</option>
                        </select>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">{{ form.ssh_auth_method === 'key' ? 'Private Key' : 'Passwort' }}</label>
                        <textarea v-if="form.ssh_auth_method === 'key'" v-model="form.ssh_secret" class="m2-input" style="height: 70px; font-family: var(--font-mono);" :placeholder="conn.connection.value?.hasSshSecret ? '•••••• (unverändert lassen = leer)' : '-----BEGIN OPENSSH PRIVATE KEY-----'"></textarea>
                        <input v-else v-model="form.ssh_secret" type="password" class="m2-input" :placeholder="conn.connection.value?.hasSshSecret ? '•••••• (unverändert lassen = leer)' : 'Passwort'">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Passphrase (optional, nur bei Key)</label>
                        <input v-model="form.ssh_passphrase" type="password" class="m2-input" :placeholder="conn.connection.value?.hasSshPassphrase ? '•••••• (unverändert lassen = leer)' : ''">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">Quest-Verzeichnis</label>
                        <input v-model="form.remote_quest_path" type="text" class="m2-input" placeholder="usr/game/share/locale/de/quest/">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">cube.txt-Pfad</label>
                        <input v-model="form.remote_cube_path" type="text" class="m2-input" placeholder="usr/game/share/textfile/">
                    </div>
                </div>

                <h3 style="font-size: 1rem; color: var(--gold-primary); margin: 25px 0 15px;">Server-Steuerung (Allowlist-Kommandos)</h3>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px;">
                    Jedes Server-Framework benennt Dienste anders - trag hier dein eigenes Kommando ein (z.B. <code>systemctl restart game</code> oder <code>./boot_game.sh</code>).
                    <code>/reload q</code> ist ein In-Game-GM-Befehl und kann hier nicht ausgelöst werden.
                </p>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">Game neu starten</label>
                        <input v-model="form.cmd_restart_game" type="text" class="m2-input" placeholder="systemctl restart game">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">DB neu starten</label>
                        <input v-model="form.cmd_restart_db" type="text" class="m2-input" placeholder="systemctl restart mysql">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Status</label>
                        <input v-model="form.cmd_status" type="text" class="m2-input" placeholder="systemctl status game">
                    </div>
                </div>

                <h3 style="font-size: 1rem; color: var(--gold-primary); margin: 25px 0 15px;">Live-Datenbank (item_proto / mob_proto)</h3>
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">DB-Host</label>
                        <input v-model="form.db_host" type="text" class="m2-input" placeholder="z.B. 123.45.67.89">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">DB-Port</label>
                        <input v-model.number="form.db_port" type="number" class="m2-input" placeholder="3306">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 15px;">
                    <div class="m2-field-group">
                        <label class="m2-label">DB-Benutzer</label>
                        <input v-model="form.db_user" type="text" class="m2-input">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">DB-Name</label>
                        <input v-model="form.db_name" type="text" class="m2-input" placeholder="player">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">DB-Passwort</label>
                        <input v-model="form.db_password" type="password" class="m2-input" :placeholder="conn.connection.value?.hasDbPassword ? '•••••• (unverändert lassen = leer)' : 'Passwort'">
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 25px; flex-wrap: wrap;">
                    <button class="m2-btn m2-btn-secondary" :disabled="testing" @click="testConnectionNow">{{ testing ? '⏳ Teste...' : '🔍 Verbindung testen' }}</button>
                    <button class="m2-btn m2-btn-primary" :disabled="saving" @click="saveConnection">{{ saving ? '⏳ Speichere...' : '💾 Speichern' }}</button>
                </div>

                <div v-if="testResult" style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <span v-if="testResult.ssh" class="status-badge" :class="testResult.ssh.ok ? 'badge-premium' : 'badge-admin'">
                        SSH: {{ testResult.ssh.ok ? '✅ OK' : '❌ ' + testResult.ssh.error }}
                    </span>
                    <span v-if="testResult.db" class="status-badge" :class="testResult.db.ok ? 'badge-premium' : 'badge-admin'">
                        DB: {{ testResult.db.ok ? '✅ OK' : '❌ ' + testResult.db.error }}
                    </span>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    <button class="m2-btn m2-btn-secondary" :disabled="runningCommand" @click="runCommand('status', 'Status')">📊 Status</button>
                    <button class="m2-btn m2-btn-secondary" :disabled="runningCommand" @click="runCommand('restart_game', 'Game neu starten')">🔄 Game neu starten</button>
                    <button class="m2-btn m2-btn-secondary" :disabled="runningCommand" @click="runCommand('restart_db', 'DB neu starten')">🔄 DB neu starten</button>
                    <button class="m2-btn m2-btn-secondary" :disabled="syncing" @click="syncDb('pull')">⬇️ Von Server laden</button>
                    <button class="m2-btn m2-btn-secondary" :disabled="syncing" @click="syncDb('push')">⬆️ Zu Server senden</button>
                </div>

                <div v-if="conn.auditLog.value.length" style="margin-top: 25px;">
                    <h3 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px;">Letzte Aktionen</h3>
                    <div style="font-size: 0.8rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                        <div v-for="(entry, i) in conn.auditLog.value" :key="i">
                            {{ entry.success ? '✅' : '❌' }} {{ entry.action }}<span v-if="entry.detail"> ({{ entry.detail }})</span> – {{ new Date(entry.created_at).toLocaleString('de-DE') }}
                        </div>
                    </div>
                </div>
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

.status-badge { padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
.badge-premium { background: var(--gold-primary); color: #000; }
.badge-admin { background: #E91E63; color: #fff; }

.m2-select-admin { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); padding: 5px 10px; border-radius: 4px; outline: none; }

.progress-container { margin-top: 10px; }
.progress-bar { height: 4px; background: var(--bg-input); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--gold-primary); transition: width 0.3s; }
</style>
