<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const user = ref(null);
const displayNameInput = ref('');
const emailInput = ref('');
const currentPw = ref('');
const newPw = ref('');
const newPwConfirm = ref('');
const uploadStatus = ref('');
const iconZipInput = ref(null);

// ── 2FA (admin only) ──────────────────────────────────
const twoFAEnabled = ref(false);
const setupData = ref(null); // { secret, qrCodeDataUrl }
const setupCode = ref('');
const recoveryCodes = ref([]);
const disablePw = ref('');
const disableCode = ref('');

async function load2FAStatus() {
    try {
        const res = await auth.authFetch('/api/auth/2fa/status');
        const data = await res.json();
        twoFAEnabled.value = !!data.enabled;
    } catch {
        // Non-critical - the section just stays in its default (disabled) state.
    }
}

async function start2FASetup() {
    try {
        const res = await auth.authFetch('/api/auth/2fa/setup', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            setupData.value = { secret: data.secret, qrCodeDataUrl: data.qrCodeDataUrl };
        } else {
            ui.toast(data.error || 'Fehler beim Einrichten', 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

async function confirm2FASetup() {
    if (!setupCode.value.trim()) { ui.toast('Bitte Code eingeben', 'error'); return; }
    try {
        const res = await auth.authFetch('/api/auth/2fa/verify-setup', {
            method: 'POST',
            body: JSON.stringify({ secret: setupData.value.secret, code: setupCode.value.trim() })
        });
        const data = await res.json();
        if (data.success) {
            recoveryCodes.value = data.recoveryCodes;
            twoFAEnabled.value = true;
            setupData.value = null;
            setupCode.value = '';
            ui.toast('2FA aktiviert!', 'success');
        } else {
            ui.toast(data.error || 'Ungültiger Code', 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

async function disable2FASubmit() {
    if (!disablePw.value || !disableCode.value.trim()) { ui.toast('Passwort und Code erforderlich', 'error'); return; }
    try {
        const res = await auth.authFetch('/api/auth/2fa/disable', {
            method: 'POST',
            body: JSON.stringify({ password: disablePw.value, code: disableCode.value.trim() })
        });
        const data = await res.json();
        if (data.success) {
            twoFAEnabled.value = false;
            recoveryCodes.value = [];
            disablePw.value = '';
            disableCode.value = '';
            ui.toast('2FA deaktiviert', 'success');
        } else {
            ui.toast(data.error || 'Fehler beim Deaktivieren', 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

const avatarInitial = () => (user.value?.displayName || user.value?.username || '').charAt(0).toUpperCase();

async function loadUser() {
    try {
        const res = await auth.authFetch('/api/auth/me');
        const data = await res.json();
        user.value = data.user;
        displayNameInput.value = data.user.displayName || '';
        emailInput.value = data.user.email || '';
    } catch {
        ui.toast('Fehler beim Laden der Account-Daten', 'error');
    }
}

async function saveProfile() {
    try {
        const res = await auth.authFetch('/api/auth/account', {
            method: 'PUT',
            body: JSON.stringify({ displayName: displayNameInput.value })
        });
        const data = await res.json();
        if (data.success) {
            ui.toast('Profil gespeichert!', 'success');
            if (auth.user) auth.setSession(auth.token, { ...auth.user, displayName: displayNameInput.value });
            loadUser();
        } else {
            ui.toast(data.error, 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

async function saveEmail() {
    try {
        const res = await auth.authFetch('/api/auth/account', {
            method: 'PUT',
            body: JSON.stringify({ email: emailInput.value })
        });
        const data = await res.json();
        if (data.success) {
            ui.toast('E-Mail aktualisiert. Bitte verifiziere dein Postfach.', 'success');
            loadUser();
        } else {
            ui.toast(data.error, 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

async function savePassword() {
    if (!currentPw.value || !newPw.value) { ui.toast('Bitte alle Felder ausfüllen', 'error'); return; }
    if (newPw.value.length < 6) { ui.toast('Mindestens 6 Zeichen', 'error'); return; }
    if (newPw.value !== newPwConfirm.value) { ui.toast('Passwörter stimmen nicht überein', 'error'); return; }

    try {
        const res = await auth.authFetch('/api/auth/account', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword: currentPw.value, newPassword: newPw.value })
        });
        const data = await res.json();
        if (data.success) {
            ui.toast('Passwort geändert!', 'success');
            currentPw.value = '';
            newPw.value = '';
            newPwConfirm.value = '';
        } else {
            ui.toast(data.error, 'error');
        }
    } catch {
        ui.toast('Server-Fehler', 'error');
    }
}

async function onIconZipChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('icons', file);

    uploadStatus.value = 'Upload lade...';
    try {
        const res = await fetch('/api/auth/assets/upload-icons', {
            method: 'POST',
            headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            ui.toast(data.message, 'success');
            uploadStatus.value = 'Erfolg!';
        } else {
            ui.toast(data.error, 'error');
            uploadStatus.value = 'Fehler beim Upload.';
        }
    } catch {
        ui.toast('Verbindungsfehler zum Server', 'error');
        uploadStatus.value = 'Verbindungsfehler.';
    } finally {
        setTimeout(() => { uploadStatus.value = ''; }, 3000);
        e.target.value = '';
    }
}

onMounted(() => {
    loadUser();
    if (auth.role === 'admin') load2FAStatus();
});
</script>

<template>
    <div class="account-container">
        <div class="account-header">
            <h1>⚙️ Account <span class="accent">EINSTELLUNGEN</span></h1>
            <p style="color:var(--text-secondary); margin-top:10px;">Verwalte dein Profil und deine Sicherheit</p>
        </div>

        <div class="account-card">
            <div class="user-meta">
                <div class="user-avatar-big">{{ avatarInitial() }}</div>
                <div class="user-meta-info">
                    <h3>{{ user ? (user.displayName || user.username) : 'Loading...' }}</h3>
                    <span>Rolle: {{ user?.role || '--' }}</span><br>
                    <span>Registriert: {{ user ? new Date(user.createdAt).toLocaleDateString('de-DE') : '--' }}</span>
                </div>
            </div>
        </div>

        <div class="account-card">
            <h2>👤 Profil</h2>
            <form @submit.prevent="saveProfile">
                <div class="form-row">
                    <label>Anzeigename</label>
                    <input v-model="displayNameInput" type="text" placeholder="Dein Anzeigename" maxlength="100">
                </div>
                <div class="form-row">
                    <label>Benutzername</label>
                    <input :value="user?.username" type="text" disabled>
                </div>
                <div class="account-actions">
                    <button type="submit" class="m2-btn m2-btn-primary">💾 Profil speichern</button>
                </div>
            </form>
        </div>

        <div class="account-card">
            <h2>📧 E-Mail</h2>
            <form @submit.prevent="saveEmail">
                <div class="form-row">
                    <label>E-Mail</label>
                    <input v-model="emailInput" type="email" placeholder="deine@email.com">
                </div>
                <div class="form-row">
                    <label>Status</label>
                    <span>
                        <span v-if="user?.emailVerified" class="badge-verified">✅ Verifiziert</span>
                        <span v-else class="badge-unverified">❌ Nicht verifiziert</span>
                    </span>
                </div>
                <div class="account-actions">
                    <button type="submit" class="m2-btn m2-btn-primary">📧 E-Mail aktualisieren</button>
                </div>
            </form>
        </div>

        <div class="account-card">
            <h2>🔒 Passwort ändern</h2>
            <form @submit.prevent="savePassword">
                <div class="form-row">
                    <label>Aktuelles Passwort</label>
                    <input v-model="currentPw" type="password" placeholder="••••••••" autocomplete="current-password">
                </div>
                <div class="form-row">
                    <label>Neues Passwort</label>
                    <input v-model="newPw" type="password" placeholder="••••••••" minlength="6" autocomplete="new-password">
                </div>
                <div class="form-row">
                    <label>Wiederholen</label>
                    <input v-model="newPwConfirm" type="password" placeholder="••••••••" autocomplete="new-password">
                </div>
                <div class="account-actions">
                    <button type="submit" class="m2-btn m2-btn-primary">🔒 Passwort ändern</button>
                </div>
            </form>
        </div>

        <div v-if="auth.role === 'admin'" class="account-card">
            <h2>🔐 Zwei-Faktor-Authentifizierung</h2>

            <template v-if="recoveryCodes.length">
                <p style="font-size: 0.85rem; color: var(--danger); margin-bottom: 15px;">
                    ⚠️ Speichere diese Recovery-Codes jetzt sicher ab - sie werden nur einmal angezeigt! Jeder Code funktioniert einmalig, falls du keinen Zugriff mehr auf deine Authenticator-App hast.
                </p>
                <div style="background: var(--bg-input); border-radius: 8px; padding: 15px; font-family: monospace; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <span v-for="c in recoveryCodes" :key="c">{{ c }}</span>
                </div>
                <div class="account-actions">
                    <button type="button" class="m2-btn m2-btn-primary" @click="recoveryCodes = []">Verstanden, gespeichert</button>
                </div>
            </template>

            <template v-else-if="twoFAEnabled">
                <p style="font-size: 0.85rem; color: var(--success); margin-bottom: 20px;">✅ 2FA ist für diesen Account aktiv.</p>
                <form @submit.prevent="disable2FASubmit">
                    <div class="form-row">
                        <label>Passwort</label>
                        <input v-model="disablePw" type="password" placeholder="••••••••" autocomplete="current-password">
                    </div>
                    <div class="form-row">
                        <label>2FA-Code</label>
                        <input v-model="disableCode" type="text" inputmode="numeric" placeholder="123456">
                    </div>
                    <div class="account-actions">
                        <button type="submit" class="m2-btn m2-btn-secondary" style="color:#f44336; border-color: rgba(244,67,54,0.2);">🔓 2FA deaktivieren</button>
                    </div>
                </form>
            </template>

            <template v-else-if="setupData">
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 15px;">
                    Scanne den QR-Code mit deiner Authenticator-App (z.B. Google Authenticator, Authy) und bestätige mit dem angezeigten Code.
                </p>
                <div style="text-align: center; margin-bottom: 15px;">
                    <img :src="setupData.qrCodeDataUrl" alt="2FA QR-Code" style="background: #fff; padding: 10px; border-radius: 8px; max-width: 200px;">
                    <div style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted); margin-top: 10px; word-break: break-all;">{{ setupData.secret }}</div>
                </div>
                <form @submit.prevent="confirm2FASetup">
                    <div class="form-row">
                        <label>Code</label>
                        <input v-model="setupCode" type="text" inputmode="numeric" placeholder="123456" autofocus>
                    </div>
                    <div class="account-actions">
                        <button type="submit" class="m2-btn m2-btn-primary">✅ Bestätigen & Aktivieren</button>
                    </div>
                </form>
            </template>

            <template v-else>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
                    2FA ist aktuell deaktiviert. Da dieser Account Admin-Rechte hat, wird die Aktivierung dringend empfohlen.
                </p>
                <div class="account-actions">
                    <button type="button" class="m2-btn m2-btn-primary" @click="start2FASetup">🔐 2FA einrichten</button>
                </div>
            </template>
        </div>

        <div class="account-card">
            <h2>🖼️ Projekt-Assets (Icons)</h2>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
                Lade hier ein <strong>ZIP-Archiv</strong> mit deinen persönlichen Item-Icons hoch.
                Diese werden bevorzugt verwendet, wenn du im Cube Editor arbeitest.
            </p>
            <div style="background: rgba(181, 149, 81, 0.05); padding: 15px; border-radius: 8px; border: 1px dashed var(--gold-primary);">
                <input ref="iconZipInput" type="file" accept=".zip" style="display: none;" @change="onIconZipChange">
                <button type="button" class="m2-btn m2-btn-secondary" style="width: 100%;" @click="iconZipInput.click()">📁 Icons ZIP auswählen & hochladen</button>
                <div v-if="uploadStatus" style="margin-top: 10px; font-size: 0.8rem; text-align: center;">{{ uploadStatus }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.account-container {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 25px;
}
.account-header { text-align: center; margin-bottom: 50px; grid-column: 1 / -1; }
.account-header h1 { font-family: var(--font-heading); font-size: 3rem; letter-spacing: 3px; }
.account-header .accent { color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow); }

.account-card {
    background: var(--bg-card); border: 1px solid var(--border-color);
    border-radius: var(--radius-md); padding: 30px;
    display: flex; flex-direction: column;
    backdrop-filter: blur(15px);
    transition: var(--transition);
}
.account-card:hover { border-color: var(--gold-border); box-shadow: var(--shadow-gold); }
.account-card h2 {
    font-family: var(--font-heading); font-size: 1.2rem; margin-bottom: 25px;
    color: var(--gold-primary); display: flex; align-items: center; gap: 12px;
    text-transform: uppercase; letter-spacing: 1.5px;
}

.form-row {
    display: grid; grid-template-columns: 140px 1fr; align-items: center;
    gap: 12px; margin-bottom: 20px;
}
.form-row label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; }
.form-row input { width: 100%; height: 42px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--radius-sm); padding: 0 15px; transition: var(--transition); }
.form-row input:focus { border-color: var(--gold-primary); box-shadow: 0 0 10px var(--gold-subtle); }

.account-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: auto; padding-top: 15px; }

.user-meta {
    display: flex; align-items: center; gap: 20px;
    padding: 20px; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid var(--border-color);
}
.user-avatar-big {
    width: 64px; height: 64px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 700;
    background: linear-gradient(135deg, var(--gold-primary), var(--gold-accent));
    color: #111;
}
.user-meta-info h3 { font-size: 1.2rem; margin-bottom: 4px; }
.user-meta-info span { font-size: 0.85rem; color: var(--text-muted); }

.badge-verified { color: var(--success); }
.badge-unverified { color: var(--danger); }

@media (max-width: 1000px) {
    .account-container { grid-template-columns: 1fr; }
    .form-row { grid-template-columns: 1fr; gap: 5px; }
}
</style>
