<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const TOTAL_STEPS = 5;
const STEP_LABELS = ['Willkommen', 'Admin-Konto', 'Domain', 'E-Mail', 'Fertig'];

const currentStep = ref(0);
const submitting = ref(false);
const errorMsg = ref('');

const form = reactive({
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    allowedOrigins: '',
    baseUrl: '',
    smtpEnabled: false,
    smtp: { host: '', port: 587, user: '', pass: '', fromName: 'M2-Tools', from: '' }
});

onMounted(() => {
    // Sensible defaults for a single-domain deployment - editable either way.
    form.allowedOrigins = window.location.origin;
    form.baseUrl = window.location.origin;
});

function validateAdminStep() {
    if (!form.username || !form.password) {
        errorMsg.value = 'Benutzername und Passwort sind erforderlich.';
        return false;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username)) {
        errorMsg.value = 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten (3-30 Zeichen).';
        return false;
    }
    if (form.password.length < 6) {
        errorMsg.value = 'Passwort muss mindestens 6 Zeichen lang sein.';
        return false;
    }
    if (form.password !== form.passwordConfirm) {
        errorMsg.value = 'Passwörter stimmen nicht überein.';
        return false;
    }
    errorMsg.value = '';
    return true;
}

function goToStep(step) {
    if (step < 0 || step >= TOTAL_STEPS) return;
    if (step > currentStep.value && currentStep.value === 1 && !validateAdminStep()) return;
    errorMsg.value = '';
    currentStep.value = step;
}

function progressStepClass(step) {
    return { active: step === currentStep.value, done: step < currentStep.value };
}

const finishLabel = computed(() => (submitting.value ? '⏳ Wird eingerichtet...' : '✅ Jetzt einrichten'));

async function submitSetup() {
    if (!validateAdminStep()) {
        currentStep.value = 1;
        return;
    }
    submitting.value = true;
    errorMsg.value = '';

    const body = {
        username: form.username.trim(),
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        email: form.email.trim() || undefined,
        allowedOrigins: form.allowedOrigins.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined
    };
    if (form.smtpEnabled && form.smtp.host) {
        body.smtp = { ...form.smtp, port: form.smtp.port ? Number(form.smtp.port) : undefined };
    }

    try {
        const res = await fetch('/api/setup/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) {
            errorMsg.value = data.error || 'Einrichtung fehlgeschlagen.';
            submitting.value = false;
            return;
        }
        auth.setSession(data.token, data.user);
        auth.needsSetup = false;
        auth.setupChecked = true;
        ui.toast('Einrichtung abgeschlossen! Willkommen bei M2-Tools.', 'success');
        router.push('/index.html');
    } catch (err) {
        errorMsg.value = 'Server nicht erreichbar. Bitte versuche es erneut.';
        submitting.value = false;
    }
}
</script>

<template>
    <div class="setup-page">
        <header>
            <h1>⚔️ M2 <span class="accent">TOOLS</span></h1>
            <p class="subtitle">Ersteinrichtung</p>
        </header>

        <div class="wizard-progress">
            <div class="progress-track">
                <div class="progress-fill" :style="{ width: (currentStep / (TOTAL_STEPS - 1) * 100) + '%' }"></div>
            </div>
            <div class="progress-steps">
                <div
                    v-for="(label, step) in STEP_LABELS"
                    :key="step"
                    class="progress-step"
                    :class="progressStepClass(step)"
                    @click="step <= currentStep + 1 && goToStep(step)"
                >
                    <div class="step-dot">{{ step + 1 }}</div>
                    <span class="step-label">{{ label }}</span>
                </div>
            </div>
        </div>

        <div class="step-card">
            <div v-if="errorMsg" class="msg error">{{ errorMsg }}</div>

            <!-- STEP 0: Willkommen -->
            <div v-if="currentStep === 0">
                <h2>👋 Willkommen bei M2-Tools</h2>
                <p class="step-desc">Bevor es losgeht, richten wir gemeinsam dein Admin-Konto und ein paar grundlegende Einstellungen ein. Das dauert nur eine Minute.</p>
                <div class="info-box">
                    <strong>🔐 Sicherheitsschlüssel</strong>
                    <p>Im letzten Schritt generiert der Server automatisch zwei geheime Schlüssel (Session- und Verschlüsselungs-Schlüssel für gespeicherte Server-Zugangsdaten) und speichert sie dauerhaft – du musst dich um nichts kümmern.</p>
                </div>
            </div>

            <!-- STEP 1: Admin-Konto -->
            <div v-if="currentStep === 1">
                <h2>👤 Admin-Konto erstellen</h2>
                <p class="step-desc">Dieses Konto hat vollen Zugriff auf alle Module und die Verwaltung.</p>

                <div class="m2-field-group">
                    <label class="m2-label">Benutzername *</label>
                    <input v-model="form.username" type="text" class="m2-input" placeholder="admin" autocomplete="username">
                    <span class="m2-hint">3-30 Zeichen, nur Buchstaben, Zahlen und Unterstriche.</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">E-Mail (optional)</label>
                    <input v-model="form.email" type="email" class="m2-input" placeholder="admin@deine-domain.de" autocomplete="email">
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Passwort *</label>
                    <input v-model="form.password" type="password" class="m2-input" placeholder="••••••••" autocomplete="new-password">
                    <span class="m2-hint">Mindestens 6 Zeichen.</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Passwort wiederholen *</label>
                    <input v-model="form.passwordConfirm" type="password" class="m2-input" placeholder="••••••••" autocomplete="new-password" @keydown.enter="goToStep(2)">
                </div>
            </div>

            <!-- STEP 2: Domain -->
            <div v-if="currentStep === 2">
                <h2>🌐 Domain & Sicherheit <span class="optional-badge">Optional</span></h2>
                <p class="step-desc">Für welche Adresse läuft dieses Tool? Wird für CORS-Absicherung und Links in E-Mails genutzt.</p>
                <div class="info-box">
                    <p>Die Felder sind bereits mit der aktuell aufgerufenen Adresse vorausgefüllt. Passe sie an, falls du über eine andere Domain zugreifst als die, unter der Nutzer das Tool später erreichen.</p>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Erlaubte Origin (CORS)</label>
                    <input v-model="form.allowedOrigins" type="text" class="m2-input" placeholder="https://deine-domain.de">
                    <span class="m2-hint">Nur diese Adresse darf mit der API sprechen. Leer lassen, um vorerst jede Origin zuzulassen (nicht empfohlen für Produktivbetrieb).</span>
                </div>
                <div class="m2-field-group">
                    <label class="m2-label">Basis-URL (für E-Mail-Links)</label>
                    <input v-model="form.baseUrl" type="text" class="m2-input" placeholder="https://deine-domain.de">
                </div>
            </div>

            <!-- STEP 3: E-Mail -->
            <div v-if="currentStep === 3">
                <h2>✉️ E-Mail-Versand <span class="optional-badge">Optional</span></h2>
                <p class="step-desc">Wird für Registrierungs-Bestätigungen genutzt.</p>
                <div class="info-box">
                    <p>Ohne SMTP-Konfiguration werden neue Registrierungen automatisch bestätigt (kein Bestätigungslink nötig) – für kleine/private Deployments meist völlig ausreichend. Du kannst SMTP jederzeit später einrichten.</p>
                </div>
                <label class="m2-checkbox-row">
                    <input v-model="form.smtpEnabled" type="checkbox">
                    <span>SMTP jetzt einrichten</span>
                </label>
                <template v-if="form.smtpEnabled">
                    <div class="m2-field-group">
                        <label class="m2-label">SMTP-Host</label>
                        <input v-model="form.smtp.host" type="text" class="m2-input" placeholder="smtp.gmail.com">
                    </div>
                    <div class="two-col">
                        <div class="m2-field-group">
                            <label class="m2-label">Port</label>
                            <input v-model.number="form.smtp.port" type="number" class="m2-input" placeholder="587">
                        </div>
                        <div class="m2-field-group">
                            <label class="m2-label">Absendername</label>
                            <input v-model="form.smtp.fromName" type="text" class="m2-input" placeholder="M2-Tools">
                        </div>
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Benutzername</label>
                        <input v-model="form.smtp.user" type="text" class="m2-input" placeholder="deine@email.com" autocomplete="off">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Passwort</label>
                        <input v-model="form.smtp.pass" type="password" class="m2-input" placeholder="App-Passwort" autocomplete="new-password">
                    </div>
                    <div class="m2-field-group">
                        <label class="m2-label">Absender-Adresse</label>
                        <input v-model="form.smtp.from" type="email" class="m2-input" placeholder="noreply@deine-domain.de">
                    </div>
                </template>
            </div>

            <!-- STEP 4: Fertig -->
            <div v-if="currentStep === 4">
                <h2>🎉 Bereit zum Einrichten</h2>
                <p class="step-desc">Admin-Konto <strong>{{ form.username || '-' }}</strong> wird angelegt, Sicherheitsschlüssel werden generiert und dauerhaft gespeichert. Das dauert nur einen Moment.</p>
                <button class="m2-btn m2-btn-primary finish-btn" :disabled="submitting" @click="submitSetup">{{ finishLabel }}</button>
            </div>
        </div>

        <div v-if="currentStep < 4" class="wizard-nav">
            <button class="m2-btn m2-btn-secondary" :disabled="currentStep === 0" @click="goToStep(currentStep - 1)">← Zurück</button>
            <span class="nav-info">Schritt {{ currentStep + 1 }} von {{ TOTAL_STEPS }}</span>
            <button class="m2-btn m2-btn-primary" @click="goToStep(currentStep + 1)">Weiter →</button>
        </div>
        <div v-else class="wizard-nav">
            <button class="m2-btn m2-btn-secondary" :disabled="submitting" @click="goToStep(currentStep - 1)">← Zurück</button>
            <span class="nav-info">Schritt {{ currentStep + 1 }} von {{ TOTAL_STEPS }}</span>
            <span></span>
        </div>
    </div>
</template>

<style scoped>
.setup-page { max-width: 640px; margin: 50px auto; padding: 0 20px 40px; }

header { text-align: center; margin-bottom: 30px; }
h1 { font-size: 2rem; letter-spacing: 2px; }
h1 .accent { color: var(--gold-primary); }
.subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 4px; }

.wizard-progress { margin-bottom: 30px; }
.progress-track { height: 3px; background: var(--border-color); border-radius: 3px; overflow: hidden; margin-bottom: 18px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--gold-primary), var(--gold-accent)); border-radius: 3px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
.progress-steps { display: flex; justify-content: space-between; }
.progress-step { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; transition: var(--transition-fast); }
.step-dot { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-input); border: 2px solid var(--border-color); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: var(--text-muted); transition: all 0.3s ease; }
.progress-step.active .step-dot { background: var(--gold-primary); border-color: var(--gold-primary); color: #111; box-shadow: 0 0 12px rgba(195, 163, 74, 0.4); transform: scale(1.15); }
.progress-step.done .step-dot { background: var(--success); border-color: var(--success); color: #fff; }
.progress-step.done .step-dot::after { content: '✓'; }
.step-label { font-size: 0.65rem; color: var(--text-muted); text-align: center; max-width: 65px; }
.progress-step.active .step-label { color: var(--gold-primary); font-weight: 600; }
.progress-step.done .step-label { color: var(--success); }

.step-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 35px; backdrop-filter: blur(20px); }
.step-card h2 { font-size: 1.3rem; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
.step-desc { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 20px; }

.optional-badge { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 1px; background: var(--bg-input); color: var(--text-muted); padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border-color); font-weight: 600; vertical-align: middle; }

.info-box { background: rgba(195, 163, 74, 0.08); border: 1px solid rgba(195, 163, 74, 0.2); border-radius: var(--radius-sm); padding: 16px 20px; margin-bottom: 20px; font-size: 0.88rem; line-height: 1.6; }
.info-box strong { display: block; margin-bottom: 6px; font-size: 0.85rem; }
.info-box p { margin: 0; color: var(--text-secondary); }

.m2-checkbox-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; cursor: pointer; font-size: 0.9rem; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }

.msg { padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.85rem; margin-bottom: 20px; background: rgba(244, 67, 54, 0.1); border: 1px solid var(--danger); color: var(--danger); }

.finish-btn { width: 100%; padding: 16px; font-size: 1rem; margin-top: 10px; }

.wizard-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
.nav-info { font-size: 0.8rem; color: var(--text-muted); }

@media (max-width: 600px) {
    .step-label { display: none; }
    .two-col { grid-template-columns: 1fr; }
}
</style>
