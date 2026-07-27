<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const errorMsg = ref('');
const needsVerification = ref(false);
const verifiedMsg = ref(route.query.verified === 'true');

// Set once login() reports requires2FA - switches the form to the
// code-entry step instead of navigating away.
const pendingToken = ref('');
const totpCode = ref('');

function goToRedirect() {
    router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/index.html');
}

async function onSubmit() {
    errorMsg.value = '';
    needsVerification.value = false;

    if (!username.value.trim() || !password.value) {
        errorMsg.value = 'Bitte alle Felder ausfüllen.';
        return;
    }

    submitting.value = true;
    try {
        const result = await auth.login(username.value.trim(), password.value);
        if (result.success && result.requires2FA) {
            pendingToken.value = result.pendingToken;
        } else if (result.success) {
            goToRedirect();
        } else {
            if (result.needsVerification) needsVerification.value = true;
            errorMsg.value = result.error;
        }
    } catch {
        errorMsg.value = 'Server nicht erreichbar';
    } finally {
        submitting.value = false;
    }
}

async function onSubmit2FA() {
    errorMsg.value = '';
    if (!totpCode.value.trim()) {
        errorMsg.value = 'Bitte Code eingeben.';
        return;
    }

    submitting.value = true;
    try {
        const result = await auth.verify2FA(pendingToken.value, totpCode.value.trim());
        if (result.success) {
            goToRedirect();
        } else {
            errorMsg.value = result.error;
        }
    } catch {
        errorMsg.value = 'Server nicht erreichbar';
    } finally {
        submitting.value = false;
    }
}

async function resendVerification() {
    try {
        const res = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: username.value.trim() })
        });
        const data = await res.json();
        ui.toast(data.message || 'Verifikation erneut gesendet.', 'success');
    } catch {
        ui.toast('Server nicht erreichbar', 'error');
    }
}

onMounted(() => {
    if (auth.isLoggedIn) {
        router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/index.html');
    }
});
</script>

<template>
    <div class="login-container">
        <div class="login-card">
            <div class="logo-area">
                <span class="logo-icon">⚔️</span>
                <h1 class="logo-text">M2 <span class="accent">TOOLS</span></h1>
                <div class="login-subtitle">Anmelden</div>
            </div>

            <div v-if="verifiedMsg" class="msg success show">✅ E-Mail erfolgreich bestätigt! Du kannst dich jetzt anmelden.</div>
            <div v-if="needsVerification" class="verification-hint show">
                ⚠️ Account noch nicht bestätigt.<br>
                <button type="button" class="resend-btn" @click="resendVerification">Bestätigung erneut senden</button>
            </div>
            <div v-if="errorMsg" class="msg error show">{{ errorMsg }}</div>

            <form v-if="!pendingToken" @submit.prevent="onSubmit">
                <div class="field">
                    <label>Benutzername</label>
                    <div class="m2-input-group">
                        <div class="input-icon-box">👤</div>
                        <input v-model="username" type="text" class="m2-input" placeholder="Benutzername oder E-Mail" required autocomplete="username">
                    </div>
                </div>

                <div class="field">
                    <label>Passwort</label>
                    <div class="m2-input-group" style="position: relative;">
                        <div class="input-icon-box">🔒</div>
                        <input v-model="password" :type="showPassword ? 'text' : 'password'" class="m2-input" placeholder="••••••••" required autocomplete="current-password">
                        <button type="button" class="password-toggle" @click="showPassword = !showPassword">{{ showPassword ? '🙈' : '👁️' }}</button>
                    </div>
                </div>

                <button type="submit" class="m2-btn-login" :disabled="submitting">{{ submitting ? '⏳' : 'Einloggen' }}</button>
            </form>

            <form v-else @submit.prevent="onSubmit2FA">
                <div class="field">
                    <label>Zwei-Faktor-Code</label>
                    <div class="m2-input-group">
                        <div class="input-icon-box">🔐</div>
                        <input v-model="totpCode" type="text" inputmode="numeric" class="m2-input" placeholder="6-stelliger Code oder Recovery-Code" required autocomplete="one-time-code" autofocus>
                    </div>
                </div>
                <button type="submit" class="m2-btn-login" :disabled="submitting">{{ submitting ? '⏳' : 'Bestätigen' }}</button>
            </form>

            <div class="login-footer">
                <router-link to="/forgot-password.html">Passwort vergessen?</router-link>
            </div>
            <div class="login-footer">
                Noch keinen Account? <router-link to="/register.html">Registrieren</router-link>
            </div>

            <div class="back-to-home">
                <router-link to="/index.html">← Zurück zum Dashboard</router-link>
            </div>
        </div>
    </div>
</template>

<style scoped>
.login-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 20px;
    z-index: 10;
}

.login-card {
    background: var(--bg-card);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(195, 163, 74, 0.2);
    border-radius: var(--radius-lg);
    padding: 50px 40px;
    box-shadow: 0 25px 50px rgba(0,0,0,0.6);
    text-align: center;
    animation: cardIn 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
    position: relative;
    width: 100%;
}

@keyframes cardIn {
    from { opacity: 0; transform: translateY(40px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.logo-area { margin-bottom: 35px; }
.logo-icon { font-size: 3.5rem; display: block; margin-bottom: 5px; filter: drop-shadow(0 0 10px var(--gold-glow)); }
.logo-text { font-family: var(--font-heading); font-size: 2.2rem; letter-spacing: 4px; color: var(--text-heading); margin: 0; }
.logo-text .accent { color: var(--gold-primary); }
.login-subtitle { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-top: 5px; }

.field { margin-bottom: 25px; text-align: left; }
.field label { display: block; margin-bottom: 10px; font-size: 0.85rem; font-weight: 600; color: var(--gold-primary); letter-spacing: 0.5px; }

/* Prefixed with .login-card to reliably outrank shared.css's global
   .m2-input-group/.input-icon-box rules (an absolute-overlay icon design
   meant for other pages) - without this, the two designs' properties were
   merging unpredictably depending on CSS chunk load order, leaving the
   icon floating on top of the input text instead of beside it. */
.login-card .m2-input-group {
    position: static;
    display: flex; align-items: stretch;
    background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    overflow: hidden; transition: all 0.3s;
}
.login-card .m2-input-group:focus-within { border-color: var(--gold-primary); box-shadow: 0 0 10px var(--gold-subtle); background: var(--bg-hover); }

.login-card .input-icon-box {
    position: static; transform: none;
    width: 48px; display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.03); border-right: 1px solid var(--border-color);
    font-size: 1.2rem; color: var(--gold-primary);
}

.login-card .m2-input { flex: 1; padding: 14px 15px; background: transparent; border: none; color: var(--text-primary); font-family: inherit; font-size: 1rem; outline: none; }

.password-toggle {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 5px; opacity: 0.6; transition: opacity 0.2s;
}
.password-toggle:hover { opacity: 1; color: var(--gold-primary); }

.m2-btn-login {
    width: 100%; padding: 16px; font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    margin-top: 15px; cursor: pointer; border: none;
    background: linear-gradient(135deg, var(--gold-primary), var(--gold-accent)); color: #000;
    border-radius: var(--radius-sm); transition: all 0.4s; box-shadow: 0 10px 20px rgba(0,0,0,0.3);
}
.m2-btn-login:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 15px 30px rgba(195, 163, 74, 0.3); filter: brightness(1.2); }
.m2-btn-login:disabled { opacity: 0.5; cursor: not-allowed; }

.login-footer { margin-top: 30px; font-size: 0.9rem; color: var(--text-muted); }
.login-footer a { color: var(--gold-primary); text-decoration: none; font-weight: 700; }
.login-footer a:hover { text-decoration: underline; }

.back-to-home { margin-top: 20px; font-size: 0.8rem; }
.back-to-home a { color: var(--text-muted); text-decoration: none; transition: 0.2s; }
.back-to-home a:hover { color: var(--gold-primary); }

.msg { padding: 12px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 20px; line-height: 1.4; }
.msg.error { background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger); color: var(--danger); }
.msg.success { background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success); color: var(--success); }

.verification-hint { background: rgba(255,152,0,0.12); border: 1px solid rgba(255,152,0,0.3); color: #ffb74d; padding: 12px; border-radius: 8px; font-size: 0.8rem; margin-bottom: 20px; line-height: 1.5; text-align: center; }
.resend-btn { color: var(--gold-primary); cursor: pointer; text-decoration: underline; background: none; border: none; font: inherit; padding: 0; }
</style>
