async function loadTeams() {
    try {
        const response = await window.m2Auth.authFetch('/api/teams');
        if (!response.ok) throw new Error('API Fehler');
        const teams = await response.json();
        const container = document.getElementById('teams-container');
        if (!container) return;
        container.innerHTML = '';

        if (teams.length === 0) {
            container.innerHTML = `<div class="empty-state" data-i18n="workspaces.no_teams">Du bist noch in keinem Team.</div>`;
            return;
        }

        for (const team of teams) {
            const teamDetailsResp = await window.m2Auth.authFetch(`/api/teams/${team.id}/details`);
            const { members } = await teamDetailsResp.json();
            const card = createTeamCard(team, members);
            container.appendChild(card);
        }
        
        if (window.m2i18n) window.m2i18n.refresh();
    } catch (e) {
        console.error(e);
        const container = document.getElementById('teams-container');
        if (container) container.innerHTML = `<div class="empty-state" style="border-color: #ff4d4d33; color: #ff4d4d;"><i class="fas fa-exclamation-triangle"></i> Teams konnten nicht geladen werden. Bitte versuche es später erneut.</div>`;
    }
}

function createTeamCard(team, members) {
    const card = document.createElement('div');
    card.className = 'team-card';
    
    const u = window.m2Auth.getUser();
    const isOwner = u?.id === team.owner_id;

    // Add member items
    let memberHTML = members.map(m => `
        <li class="member-item">
            <div class="member-info">
                <i class="fas fa-user-circle"></i>
                <span>${window.m2Safe.escape(m.display_name || m.username)}</span>
                <span class="member-role">${m.role}</span>
            </div>
            ${isOwner && m.role !== 'owner' ? `
                <button onclick="removeMember(${team.id}, ${m.id})" class="m2-btn m2-btn-secondary" style="padding: 2px 8px; font-size: 0.7rem; color: #ff4d4d; border-color: rgba(255,77,77,0.1);">
                    Entfernen
                </button>
            ` : ''}
        </li>
    `).join('');

    card.innerHTML = `
        <div class="team-header">
            <span class="team-name">${window.m2Safe.escape(team.name)}</span>
            <span style="font-size: 1.2rem;">${isOwner ? '👑' : '👥'}</span>
        </div>
        <ul class="member-list">
            ${memberHTML}
        </ul>
        
        ${isOwner ? `
            <div class="add-member-form">
                <input type="text" id="add-member-${team.id}" class="m2-input" style="padding: 8px 12px; font-size: 0.85rem;" placeholder="Benutzername">
                <button class="m2-btn m2-btn-primary" onclick="addMember(${team.id})" style="padding: 0 15px; font-size: 0.8rem;">
                    Hinzufügen
                </button>
            </div>
            <button class="m2-btn m2-btn-secondary" onclick="deleteTeam(${team.id})" style="margin-top: 10px; width: 100%; justify-content: center; color: #ff4d4d; border-color: rgba(255,77,77,0.1);">
                <i class="fas fa-trash-alt"></i> Team auflösen
            </button>
        ` : `
            <button class="m2-btn m2-btn-secondary" onclick="removeMember(${team.id}, ${u?.id})" style="margin-top: 10px; width: 100%; justify-content: center; color: #ff4d4d; border-color: rgba(255,77,77,0.1);">
                <i class="fas fa-sign-out-alt"></i> Team verlassen
            </button>
        `}
    `;
    return card;
}

async function showCreateTeam() {
    window.m2Prompt(
        'Neues Team erstellen',
        'Gib einen Namen für dein neues Team ein:',
        async (name) => {
            if (!name) return;
            const response = await window.m2Auth.authFetch('/api/teams/create', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            if (response.ok) {
                window.m2Toast('Team erfolgreich erstellt!', 'success');
                loadTeams();
            } else {
                const data = await response.json();
                window.m2Toast(data.error || 'Fehler beim Erstellen', 'error');
            }
        }
    );
}

// closeModal removed as handled by m2Prompt
async function addMember(teamId) {
    const input = document.getElementById(`add-member-${teamId}`);
    const username = input.value.trim();
    if (!username) return;

    const response = await window.m2Auth.authFetch('/api/teams/addMember', {
        method: 'POST',
        body: JSON.stringify({ teamId, username })
    });

    if (response.ok) {
        loadTeams();
    } else {
        const err = await response.json();
        alert(err.error || 'Fehler beim Hinzufügen');
    }
}

async function removeMember(teamId, userId) {
    const isSelf = parseInt(userId) === window.m2Auth.getUser()?.id;
    const msg = isSelf ? 'Möchtest du das Team wirklich verlassen?' : 'Diesen Nutzer wirklich aus dem Team entfernen?';
    
    window.m2Confirm('Mitgliedschaft', msg, async () => {
        const response = await window.m2Auth.authFetch('/api/teams/removeMember', {
            method: 'POST',
            body: JSON.stringify({ teamId, userId })
        });
        if (response.ok) loadTeams();
    });
}
async function deleteTeam(id) {
    window.m2Confirm(
        'Team auflösen', 
        'Möchtest du dieses Team wirklich löschen? Alle Teammitglieder verlieren den Zugriff.',
        async () => {
            const response = await window.m2Auth.authFetch('/api/teams/delete', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (response.ok) {
                window.m2Toast('Team gelöscht', 'success');
                loadTeams();
            } else {
                const err = await response.json();
                window.m2Toast(err.error || 'Fehler beim Löschen', 'error');
            }
        }
    );
}

// Initial load
async function initTeams() {
    if (!window.m2Auth?.authFetch) {
        setTimeout(initTeams, 50);
        return;
    }
    loadTeams();
}

document.addEventListener('DOMContentLoaded', initTeams);
