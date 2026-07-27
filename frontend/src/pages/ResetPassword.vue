<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const token = typeof route.query.token === 'string' ? route.query.token : '';
const password = ref('');
const passwordConfirm = ref('');
const submitting = ref(false);
const errorMsg = ref('');
const done = ref(false);

async function onSubmit() {
    errorMsg.value = '';
    if (!password.value || password.value.length < 6) {
        errorMsg.value = 'Passwort muss mindestens 6 Zeichen lang sein.';
        return;
    }
    if (password.value !== passwordConfirm.value) {
        errorMsg.value = 'Passwörter stimmen nicht überein.';
        return;
    }

    submitting.value = true;
    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password: password.value, passwordConfirm: passwordConfirm.value })
        });
        const data = await res.json();
        if (data.success) {
            done.value = true;
            setTimeout(() => router.push('/login.html'), 2500);
        } else {
            errorMsg.value = data.error || 'Zurücksetzen fehlgeschlagen';
        }
    } catch {
        errorMsg.value = 'Server nicht erreichbar';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="login-container">
        <div class="login-card">
            <div class="logo-area">
                <span class="logo-icon">🔑</span>
                <h1 class="logo-text">M2 <span class="accent">TOOLS</span></h1>
                <div class="login-subtitle">Neues Passwort vergeben</div>
            </div>

            <div v-if="!token" class="msg error show">Kein Reset-Token in der URL gefunden. Bitte den Link aus der E-Mail erneut öffnen.</div>
            <div v-else-if="done" class="msg success show">✅ Passwort erfolgreich geändert. Du wirst zum Login weitergeleitet...</div>
            <div v-if="errorMsg" class="msg error show">{{ errorMsg }}</div>

            <form v-if="token && !done" @submit.prevent="onSubmit">
                <div class="field">
                    <label>Neues Passwort</label>
                    <div class="m2-input-group">
                        <div class="input-icon-box">🔒</div>
                        <input v-model="password" type="password" class="m2-input" placeholder="••••••••" required autocomplete="new-password">
                    </div>
                </div>
                <div class="field">
                    <label>Passwort bestätigen</label>
                    <div class="m2-input-group">
                        <div class="input-icon-box">🔒</div>
                        <input v-model="passwordConfirm" type="password" class="m2-input" placeholder="••••••••" required autocomplete="new-password">
                    </div>
                </div>
                <button type="submit" class="m2-btn-login" :disabled="submitting">{{ submitting ? '⏳' : 'Passwort setzen' }}</button>
            </form>

            <div class="login-footer">
                <router-link to="/login.html">← Zurück zum Login</router-link>
            </div>
        </div>
    </div>
</template>

<style scoped>
.login-container { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; width: 100%; max-width: 420px; margin: 0 auto; padding: 20px; z-index: 10; }
.login-card { background: var(--bg-card); backdrop-filter: blur(25px); border: 1px solid rgba(195, 163, 74, 0.2); border-radius: var(--radius-lg); padding: 50px 40px; box-shadow: 0 25px 50px rgba(0,0,0,0.6); text-align: center; width: 100%; }
.logo-area { margin-bottom: 35px; }
.logo-icon { font-size: 3.5rem; display: block; margin-bottom: 5px; filter: drop-shadow(0 0 10px var(--gold-glow)); }
.logo-text { font-family: var(--font-heading); font-size: 2.2rem; letter-spacing: 4px; color: var(--text-heading); margin: 0; }
.logo-text .accent { color: var(--gold-primary); }
.login-subtitle { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-top: 5px; }
.field { margin-bottom: 25px; text-align: left; }
.field label { display: block; margin-bottom: 10px; font-size: 0.85rem; font-weight: 600; color: var(--gold-primary); letter-spacing: 0.5px; }
.m2-input-group { display: flex; align-items: stretch; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; transition: all 0.3s; }
.m2-input-group:focus-within { border-color: var(--gold-primary); box-shadow: 0 0 10px var(--gold-subtle); background: var(--bg-hover); }
.input-icon-box { width: 48px; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.03); border-right: 1px solid var(--border-color); font-size: 1.2rem; color: var(--gold-primary); }
.m2-input { flex: 1; padding: 14px 15px; background: transparent; border: none; color: var(--text-primary); font-family: inherit; font-size: 1rem; outline: none; }
.m2-btn-login { width: 100%; padding: 16px; font-size: 1rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 15px; cursor: pointer; border: none; background: linear-gradient(135deg, var(--gold-primary), var(--gold-accent)); color: #000; border-radius: var(--radius-sm); transition: all 0.4s; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
.m2-btn-login:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 15px 30px rgba(195, 163, 74, 0.3); filter: brightness(1.2); }
.m2-btn-login:disabled { opacity: 0.5; cursor: not-allowed; }
.login-footer { margin-top: 20px; font-size: 0.9rem; color: var(--text-muted); }
.login-footer a { color: var(--gold-primary); text-decoration: none; font-weight: 700; }
.login-footer a:hover { text-decoration: underline; }
.msg { padding: 12px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 20px; line-height: 1.4; }
.msg.error { background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger); color: var(--danger); }
.msg.success { background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success); color: var(--success); }
</style>
