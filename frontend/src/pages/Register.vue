<script setup>
import { ref } from 'vue';

const username = ref('');
const email = ref('');
const password = ref('');
const passwordConfirm = ref('');
const submitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const autoVerified = ref(false);
const submitted = ref(false);

async function onSubmit() {
    errorMsg.value = '';
    successMsg.value = '';

    if (password.value !== passwordConfirm.value) {
        errorMsg.value = 'Passwörter stimmen nicht überein.';
        return;
    }

    submitting.value = true;
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username.value.trim(),
                email: email.value.trim(),
                password: password.value,
                passwordConfirm: passwordConfirm.value
            })
        });
        const data = await res.json();

        if (data.success) {
            submitted.value = true;
            successMsg.value = data.message;
            autoVerified.value = !!data.autoVerified;
        } else {
            errorMsg.value = data.error || 'Fehler bei der Registrierung';
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
                <span class="logo-icon">⚔️</span>
                <h1 class="logo-text">M2 <span class="accent">TOOLS</span></h1>
                <div class="login-subtitle">Registrieren</div>
            </div>

            <div v-if="successMsg" class="msg success show">
                ✅ <strong>{{ successMsg }}</strong><br><br>
                <router-link v-if="autoVerified" to="/login.html" style="color:var(--gold-primary);font-weight:700;">→ Jetzt anmelden</router-link>
                <template v-else>Bitte prüfe dein Postfach und klicke auf den Bestätigungslink.</template>
            </div>
            <div v-if="errorMsg" class="msg error show">{{ errorMsg }}</div>

            <form v-if="!submitted" @submit.prevent="onSubmit">
                <div class="form-grid">
                    <div class="field full">
                        <label>Benutzername</label>
                        <div class="m2-input-group">
                            <div class="input-icon-box">👤</div>
                            <input v-model="username" type="text" class="m2-input" placeholder="Benutzername" required minlength="3" autocomplete="username">
                        </div>
                        <div class="hint">3-20 Zeichen, keine Sonderzeichen.</div>
                    </div>

                    <div class="field full">
                        <label>E-Mail Adresse</label>
                        <div class="m2-input-group">
                            <div class="input-icon-box">📧</div>
                            <input v-model="email" type="email" class="m2-input" placeholder="deine@email.com" required autocomplete="email">
                        </div>
                    </div>

                    <div class="field">
                        <label>Passwort</label>
                        <div class="m2-input-group">
                            <div class="input-icon-box">🔒</div>
                            <input v-model="password" type="password" class="m2-input" placeholder="••••••••" required minlength="6" autocomplete="new-password">
                        </div>
                    </div>

                    <div class="field">
                        <label>Wiederholen</label>
                        <div class="m2-input-group">
                            <div class="input-icon-box">🔒</div>
                            <input v-model="passwordConfirm" type="password" class="m2-input" placeholder="••••••••" required autocomplete="new-password">
                        </div>
                    </div>
                </div>

                <button type="submit" class="m2-btn-reg" :disabled="submitting">{{ submitting ? 'Registriere...' : 'Konto Erstellen' }}</button>
            </form>

            <div class="login-footer">
                Schon registriert? <router-link to="/login.html">Einloggen</router-link>
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
    max-width: 480px;
    margin: 0 auto;
    padding: 20px;
    z-index: 10;
}

.login-card {
    background: var(--bg-card);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(195, 163, 74, 0.2);
    border-radius: var(--radius-lg);
    padding: 40px;
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

.logo-area { margin-bottom: 25px; }
.logo-icon { font-size: 3rem; display: block; margin-bottom: 5px; filter: drop-shadow(0 0 10px var(--gold-glow)); }
.logo-text { font-family: var(--font-heading); font-size: 1.8rem; letter-spacing: 4px; color: var(--text-heading); margin: 0; }
.logo-text .accent { color: var(--gold-primary); }
.login-subtitle { font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 2px; margin-top: 5px; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left; }
.field { margin-bottom: 15px; }
.field.full { grid-column: span 2; }
.field label { display: block; margin-bottom: 8px; font-size: 0.8rem; font-weight: 600; color: var(--gold-primary); letter-spacing: 0.5px; }

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
    width: 44px; display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.03); border-right: 1px solid var(--border-color);
    font-size: 1.1rem; color: var(--gold-primary);
}

.login-card .m2-input { flex: 1; padding: 12px 14px; background: transparent; border: none; color: var(--text-primary); font-family: inherit; font-size: 0.95rem; outline: none; }

.m2-btn-reg {
    width: 100%; padding: 16px; font-size: 1rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
    margin-top: 20px; cursor: pointer; border: none;
    background: linear-gradient(135deg, var(--gold-primary), var(--gold-accent)); color: #000;
    border-radius: var(--radius-sm); transition: all 0.4s; box-shadow: 0 10px 20px rgba(0,0,0,0.3);
}
.m2-btn-reg:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 15px 30px rgba(195, 163, 74, 0.3); filter: brightness(1.2); }
.m2-btn-reg:disabled { opacity: 0.5; cursor: not-allowed; }

.login-footer { margin-top: 25px; font-size: 0.9rem; color: var(--text-muted); }
.login-footer a { color: var(--gold-primary); text-decoration: none; font-weight: 700; }

.msg { padding: 12px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 20px; line-height: 1.4; text-align: center; }
.msg.error { background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger); color: var(--danger); }
.msg.success { background: rgba(76, 175, 80, 0.1); border: 1px solid var(--success); color: var(--success); }

.hint { font-size: 0.72rem; color: var(--text-muted); margin-top: 4px; line-height: 1.3; }
</style>
