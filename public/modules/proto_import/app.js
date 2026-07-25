document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('import-btn');
    const clearBtn = document.getElementById('clear-btn');
    const textarea = document.getElementById('proto-text');
    const tabs = document.querySelectorAll('.tab');
    
    let currentType = 'item'; // 'item' or 'mob'

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentType = tab.getAttribute('data-type');
            
            // Update placeholder
            if (currentType === 'item') {
                textarea.placeholder = "Inhalt der item_proto.txt hier einfügen...";
            } else {
                textarea.placeholder = "Inhalt der mob_proto.txt hier einfügen...";
            }
        });
    });

    // Clear textarea
    clearBtn.addEventListener('click', () => {
        textarea.value = '';
    });

    // Import action
    importBtn.addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (!text) {
            return window.m2Toast('Kein Inhalt zum Importieren.', 'warning');
        }

        importBtn.disabled = true;
        importBtn.textContent = '⌛ Importiert...';

        try {
            const endpoint = currentType === 'item' ? '/api/proto/items' : '/api/proto/mobs';
            const response = await window.m2Auth.authFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ text })
            });

            const result = await response.json();
            if (result.success) {
                window.m2Toast(`${result.imported} von ${result.total} Einträgen importiert!`, 'success');
                textarea.value = '';
                loadStats();
            } else {
                window.m2Toast('Fehler: ' + (result.error || 'Unbekannter Fehler'), 'error');
            }
        } catch (err) {
            console.error(err);
            window.m2Toast('Netzwerkfehler beim Import.', 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.textContent = '⚡ Import starten';
        }
    });

    // Load Stats
    async function loadStats() {
        try {
            const response = await fetch('/api/proto/stats');
            const stats = await response.json();
            document.getElementById('total-items').textContent = stats.items || 0;
            document.getElementById('total-mobs').textContent = stats.mobs || 0;
            document.getElementById('db-type').textContent = stats.dbType || 'Unknown';
        } catch (err) {
            console.error('Stats load error:', err);
        }
    }

    // Initialize
    async function initProtoImport() {
        if (!window.m2Auth?.authFetch) {
            setTimeout(initProtoImport, 50);
            return;
        }
        loadStats();
    }

    initProtoImport();
});
