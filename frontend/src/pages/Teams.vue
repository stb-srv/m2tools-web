<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const teams = ref([]);
const loading = ref(true);
const loadError = ref(false);
const newMemberInputs = ref({});

async function loadTeams() {
    loading.value = true;
    loadError.value = false;
    try {
        const res = await auth.authFetch('/api/teams');
        if (!res.ok) throw new Error('API Fehler');
        const list = await res.json();

        const withMembers = [];
        for (const team of list) {
            const detailsRes = await auth.authFetch(`/api/teams/${team.id}/details`);
            const { members } = await detailsRes.json();
            withMembers.push({ ...team, members });
        }
        teams.value = withMembers;
    } catch (e) {
        console.error(e);
        loadError.value = true;
    } finally {
        loading.value = false;
    }
}

function isOwner(team) {
    return auth.user?.id === team.owner_id;
}

async function showCreateTeam() {
    const name = await ui.prompt('Neues Team erstellen', 'Gib einen Namen für dein neues Team ein:');
    if (!name) return;
    const res = await auth.authFetch('/api/teams/create', { method: 'POST', body: JSON.stringify({ name }) });
    if (res.ok) {
        ui.toast('Team erfolgreich erstellt!', 'success');
        loadTeams();
    } else {
        const data = await res.json();
        ui.toast(data.error || 'Fehler beim Erstellen', 'error');
    }
}

async function addMember(teamId) {
    const username = (newMemberInputs.value[teamId] || '').trim();
    if (!username) return;

    const res = await auth.authFetch('/api/teams/addMember', {
        method: 'POST',
        body: JSON.stringify({ teamId, username })
    });

    if (res.ok) {
        newMemberInputs.value[teamId] = '';
        loadTeams();
    } else {
        const err = await res.json();
        ui.toast(err.error || 'Fehler beim Hinzufügen', 'error');
    }
}

async function removeMember(teamId, userId) {
    const isSelf = parseInt(userId) === auth.user?.id;
    const msg = isSelf ? 'Möchtest du das Team wirklich verlassen?' : 'Diesen Nutzer wirklich aus dem Team entfernen?';
    const confirmed = await ui.confirm('Mitgliedschaft', msg);
    if (!confirmed) return;
    const res = await auth.authFetch('/api/teams/removeMember', { method: 'POST', body: JSON.stringify({ teamId, userId }) });
    if (res.ok) loadTeams();
}

async function deleteTeam(id) {
    const confirmed = await ui.confirm('Team auflösen', 'Möchtest du dieses Team wirklich löschen? Alle Teammitglieder verlieren den Zugriff.');
    if (!confirmed) return;
    const res = await auth.authFetch('/api/teams/delete', { method: 'POST', body: JSON.stringify({ id }) });
    if (res.ok) {
        ui.toast('Team gelöscht', 'success');
        loadTeams();
    } else {
        const err = await res.json();
        ui.toast(err.error || 'Fehler beim Löschen', 'error');
    }
}

onMounted(loadTeams);
</script>

<template>
    <header style="text-align: center; margin-bottom: 50px;">
        <h1 style="font-family: var(--font-heading); font-size: 3rem; letter-spacing: 2px;">
            👥 TEAM <span style="color: var(--gold-primary); text-shadow: 0 0 15px var(--gold-glow);">MANAGER</span>
        </h1>
        <p style="color: var(--text-secondary); margin-top: 10px;">Verwalte deine Teams und arbeite gemeinsam an Projekten.</p>
    </header>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
        <button class="m2-btn m2-btn-primary" @click="showCreateTeam">✨ Neues Team erstellen</button>
        <router-link to="/workspaces.html" class="m2-btn m2-btn-secondary" style="text-decoration:none;">📂 Workspaces</router-link>
    </div>

    <div class="teams-grid">
        <div v-if="loading" class="empty-state">Lade Teams...</div>
        <div v-else-if="loadError" class="empty-state" style="border-color: #ff4d4d33; color: #ff4d4d;">Teams konnten nicht geladen werden. Bitte versuche es später erneut.</div>
        <div v-else-if="teams.length === 0" class="empty-state">Du bist noch in keinem Team.</div>
        <div v-for="team in teams" :key="team.id" class="team-card">
            <div class="team-header">
                <span class="team-name">{{ team.name }}</span>
                <span style="font-size: 1.2rem;">{{ isOwner(team) ? '👑' : '👥' }}</span>
            </div>
            <ul class="member-list">
                <li v-for="m in team.members" :key="m.id" class="member-item">
                    <div class="member-info">
                        <span>{{ m.display_name || m.username }}</span>
                        <span class="member-role">{{ m.role }}</span>
                    </div>
                    <button
                        v-if="isOwner(team) && m.role !== 'owner'"
                        class="m2-btn m2-btn-secondary"
                        style="padding: 2px 8px; font-size: 0.7rem; color: #ff4d4d; border-color: rgba(255,77,77,0.1);"
                        @click="removeMember(team.id, m.id)"
                    >
                        Entfernen
                    </button>
                </li>
            </ul>

            <template v-if="isOwner(team)">
                <div class="add-member-form">
                    <input v-model="newMemberInputs[team.id]" type="text" class="m2-input" style="padding: 8px 12px; font-size: 0.85rem;" placeholder="Benutzername">
                    <button class="m2-btn m2-btn-primary" style="padding: 0 15px; font-size: 0.8rem;" @click="addMember(team.id)">Hinzufügen</button>
                </div>
                <button class="m2-btn m2-btn-secondary" style="margin-top: 10px; width: 100%; justify-content: center; color: #ff4d4d; border-color: rgba(255,77,77,0.1);" @click="deleteTeam(team.id)">
                    🗑️ Team auflösen
                </button>
            </template>
            <button v-else class="m2-btn m2-btn-secondary" style="margin-top: 10px; width: 100%; justify-content: center; color: #ff4d4d; border-color: rgba(255,77,77,0.1);" @click="removeMember(team.id, auth.user?.id)">
                🚪 Team verlassen
            </button>
        </div>
    </div>
</template>

<style scoped>
.teams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 25px;
    margin-top: 30px;
}

.team-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 25px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    transition: var(--transition);
}
.team-card:hover { border-color: var(--gold-primary); box-shadow: 0 0 20px var(--gold-glow); }

.team-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 15px; }
.team-name { font-size: 1.3rem; font-weight: 700; color: var(--gold-primary); font-family: var(--font-heading); }

.member-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.member-item { display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 10px 15px; border-radius: var(--radius-sm); }
.member-info { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; }
.member-role { font-size: 0.7rem; background: var(--gold-subtle); color: var(--gold-primary); padding: 2px 6px; border-radius: 4px; font-weight: 700; text-transform: uppercase; }

.add-member-form { display: flex; gap: 8px; margin-top: 10px; }

.empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px;
    background: var(--bg-card);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-muted);
}
</style>
