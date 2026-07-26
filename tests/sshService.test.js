const sshService = require('../server/services/sshService');

describe('sshService allowlist', () => {
    test('exposes exactly the three allowlisted command keys', () => {
        expect(sshService.ALLOWED_COMMAND_KEYS).toEqual(['restart_game', 'restart_db', 'status']);
    });

    test('rejects an unknown command key without attempting a connection', async () => {
        await expect(sshService.runAllowlistedCommand({ ssh_host: '127.0.0.1' }, 'delete_everything'))
            .rejects.toThrow('Unbekannter Befehls-Key');
    });

    test('rejects a valid key with no command configured on the connection', async () => {
        await expect(sshService.runAllowlistedCommand({ ssh_host: '127.0.0.1' }, 'status'))
            .rejects.toThrow('kein Kommando konfiguriert');
    });
});
