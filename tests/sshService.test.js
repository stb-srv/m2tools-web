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
        await expect(sshService.runAllowlistedCommand({ ssh_host: '127.0.0.1', ssh_host_key_fingerprint: 'abc' }, 'status'))
            .rejects.toThrow('kein Kommando konfiguriert');
    });
});

describe('sshService host-key pinning (TOFU)', () => {
    test('withConnection refuses to connect at all without a pinned host key', async () => {
        await expect(sshService.withConnection({ ssh_host: '127.0.0.1' }, () => {}))
            .rejects.toThrow('Kein bekannter Host-Key hinterlegt');
    });

    test('testConnection refuses to connect without a pinned host key', async () => {
        await expect(sshService.testConnection({ ssh_host: '127.0.0.1' }))
            .rejects.toThrow('Kein bekannter Host-Key hinterlegt');
    });

    test('uploadFile refuses to connect without a pinned host key', async () => {
        await expect(sshService.uploadFile({ ssh_host: '127.0.0.1' }, '/tmp/x.lua', 'code'))
            .rejects.toThrow('Kein bekannter Host-Key hinterlegt');
    });

    test('a configured command still requires a pinned host key before running', async () => {
        await expect(sshService.runAllowlistedCommand(
            { ssh_host: '127.0.0.1', cmd_status: 'systemctl status game' },
            'status'
        )).rejects.toThrow('Kein bekannter Host-Key hinterlegt');
    });
});
