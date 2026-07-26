import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Thin wrapper around the /api/server_connections/:workspaceId endpoints.
 * `workspaceIdRef` is a Vue ref so callers that resolve their workspace id
 * asynchronously (e.g. QuestBuilder/CubeEditor fetching the active
 * workspace on mount) can update it in place and have subsequent calls
 * pick up the new value.
 */
export function useServerConnection(workspaceIdRef) {
    const auth = useAuthStore();
    const connection = ref(null);
    const loading = ref(false);
    const auditLog = ref([]);

    function wsId() {
        const id = workspaceIdRef?.value;
        if (!id) throw new Error('Kein Workspace ausgewählt');
        return id;
    }

    async function parseOrThrow(res, fallbackMessage) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || fallbackMessage);
        return data;
    }

    async function load() {
        if (!workspaceIdRef?.value) { connection.value = null; return; }
        loading.value = true;
        try {
            const res = await auth.authFetch(`/api/server_connections/${wsId()}`);
            connection.value = res.ok ? await res.json() : null;
        } finally {
            loading.value = false;
        }
    }

    async function save(payload) {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        const data = await parseOrThrow(res, 'Speichern fehlgeschlagen');
        await load();
        return data;
    }

    async function test() {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/test`, { method: 'POST' });
        return parseOrThrow(res, 'Verbindungstest fehlgeschlagen');
    }

    async function deployQuest(filename, content) {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/deploy-quest`, {
            method: 'POST',
            body: JSON.stringify({ filename, content })
        });
        return parseOrThrow(res, 'Deploy fehlgeschlagen');
    }

    async function deployCube(filename, content) {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/deploy-cube`, {
            method: 'POST',
            body: JSON.stringify({ filename, content })
        });
        return parseOrThrow(res, 'Deploy fehlgeschlagen');
    }

    async function runCommand(key) {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/command`, {
            method: 'POST',
            body: JSON.stringify({ key })
        });
        return parseOrThrow(res, 'Kommando fehlgeschlagen');
    }

    async function dbPull() {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/db/pull`, { method: 'POST' });
        return parseOrThrow(res, 'Sync von Server fehlgeschlagen');
    }

    async function dbPush() {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/db/push`, { method: 'POST' });
        return parseOrThrow(res, 'Sync zu Server fehlgeschlagen');
    }

    async function forgetHostKey() {
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/forget-host-key`, { method: 'POST' });
        const data = await parseOrThrow(res, 'Host-Key konnte nicht zurückgesetzt werden');
        await load();
        return data;
    }

    async function loadAuditLog() {
        if (!workspaceIdRef?.value) { auditLog.value = []; return; }
        const res = await auth.authFetch(`/api/server_connections/${wsId()}/audit-log`);
        auditLog.value = res.ok ? await res.json() : [];
    }

    return {
        connection, loading, auditLog,
        load, save, test, deployQuest, deployCube, runCommand, dbPull, dbPush, forgetHostKey, loadAuditLog
    };
}
