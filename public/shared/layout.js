/**
 * M2-Tools – Shared Layout Engine
 * Automatically injects consistent Navbar and Footer.
 * Configures platform-wide modules (Theme, Auth, I18n).
 */
(function() {
    'use strict';

    // ── Safety Helpers ─────────────────────────────────────
    // Safety helpers are now in /shared/utils.js

    class M2Layout {
        constructor() {
            this.config = {
                title: 'M2-Tools',
                modules: [] // Populated dynamically from API
            };
            this.init();
        }

        async init() {
            // Wait for core modules & their methods to be available (prevent race conditions)
            if (!window.m2Auth?.authFetch || !window.m2Theme?.init || !window.m2i18n?.init) {
                console.warn('[M2-Layout] Waiting for core module methods...');
                setTimeout(() => this.init(), 50);
                return;
            }

            // 1. Fetch module access levels from server
            await this.fetchModuleStatus();

            // 2. Clear previous injections
            this.clearInjections();

            // 3. Create CSS link for shared styles
            if (!document.querySelector('link[id="m2-shared-css"]')) {
                const link = document.createElement('link');
                link.id = 'm2-shared-css';
                link.rel = 'stylesheet';
                link.href = '/shared/shared.css';
                document.head.appendChild(link);
            }

            // 4. Inject Particles Engine
            if (!document.querySelector('script[id="m2-particles-js"]')) {
                const script = document.createElement('script');
                script.id = 'm2-particles-js';
                script.src = '/shared/particles.js';
                document.body.appendChild(script);
            }

            // 5. Inject UI
            this.injectNavbar();
            this.injectFooter();
            this.updateI18n();

            // Setup listeners
            window.addEventListener('m2-theme-changed', () => this.updateNavbarIcons());
            window.addEventListener('m2-lang-changed', () => this.updateI18n());
            
            this.initCommandPalette();
        }

        initCommandPalette() {
            window.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    this.showCommandPalette();
                }
            });
        }

        async fetchModuleStatus() {
            try {
                const res = await fetch('/api/auth/modules/status');
                if (!res.ok) return;
                const statuses = await res.json();
                
                // Add Dashboard as first entry
                this.config.modules = [
                    { id: 'dashboard', name: 'Dashboard', url: '/index.html', icon: '🏠', access_level: 'public' },
                    ...statuses
                ];
            } catch (e) { console.error('[M2-Layout] Could not fetch module status', e); }
        }

        clearInjections() {
            const existingNav = document.getElementById('m2-navbar');
            if (existingNav) existingNav.remove();
            const existingFoot = document.getElementById('m2-footer');
            if (existingFoot) existingFoot.remove();
        }

        injectNavbar() {
            const currentPath = window.location.pathname;
            const user = window.m2Auth.getUser();

            // ── Main Top Navbar ──
            const nav = document.createElement('nav');
            nav.className = 'm2-navbar';
            nav.id = 'm2-navbar';

            // Logo
            const left = document.createElement('div');
            left.className = 'm2-nav-left';
            left.id = 'm2-navbar-left';
            left.innerHTML = `<a href="/index.html" class="m2-logo">M2 <span>TOOLS</span></a>`;

            // Right Actions
            const right = document.createElement('div');
            right.className = 'm2-nav-right';

            // Command Palette
            const cmdBtn = document.createElement('button');
            cmdBtn.className = 'm2-control-btn with-text';
            cmdBtn.title = 'Command Palette (Strg+K)';
            cmdBtn.innerHTML = '🔍 <span>Suche</span>';
            cmdBtn.onclick = () => this.showCommandPalette();
            right.appendChild(cmdBtn);

            // Patch Notes / Neues
            const changelogBtn = document.createElement('button');
            changelogBtn.className = 'm2-control-btn with-text';
            changelogBtn.title = 'Patch Notes';
            changelogBtn.innerHTML = `⭐ <span data-i18n="nav.patch_notes">Patch Notes</span>`;
            changelogBtn.onclick = () => window.location.href = '/patch_notes.html';
            right.appendChild(changelogBtn);

            // Workspace Switcher
            if (user) {
                this.injectWorkspaceSwitcher(left);
            }

            // Lang Toggle
            const langBtn = document.createElement('button');
            langBtn.className = 'm2-control-btn with-text lang-toggle-btn';
            langBtn.title = 'Switch Language';
            const curLang = window.m2i18n.currentLang();
            langBtn.innerHTML = `${curLang === 'de' ? '🇩🇪' : '🇬🇧'} <span>Sprache</span>`;
            langBtn.onclick = () => {
                const newLang = window.m2i18n.currentLang() === 'de' ? 'en' : 'de';
                window.m2i18n.switch(newLang);
                langBtn.innerHTML = `${newLang === 'de' ? '🇩🇪' : '🇬🇧'} <span>Sprache</span>`;
            };
            right.appendChild(langBtn);

            // Theme Toggle
            const themeBtn = document.createElement('button');
            themeBtn.className = 'm2-control-btn with-text theme-toggle-btn';
            themeBtn.id = 'm2-theme-btn';
            themeBtn.innerHTML = '🌙 <span>Theme</span>'; // Dynamic symbol updated below
            themeBtn.onclick = () => window.m2Theme.toggle();
            right.appendChild(themeBtn);

            // Admin Settings (Shield Icon)
            if (user && user.role === 'admin') {
                const adminBtn = document.createElement('button');
                adminBtn.className = 'm2-control-btn with-text';
                adminBtn.title = 'Admin Panel (Berechtigungen)';
                adminBtn.innerHTML = '🛡️ <span>Admin</span>';
                adminBtn.onclick = () => window.location.href = '/admin.html';
                right.appendChild(adminBtn);
            }

            // User Info
            if (window.m2Auth.isLoggedIn()) {
                const u = window.m2Auth.getUser();
                const initial = (u.displayName || u.username).charAt(0).toUpperCase();
                const profile = document.createElement('div');
                profile.className = 'm2-user-profile';
                profile.innerHTML = `
                    <div class="m2-avatar">${initial}</div>
                    <span class="m2-user-name">${u.displayName || u.username}</span>
                `;
                profile.onclick = () => window.location.href = '/account.html';
                right.appendChild(profile);

                const helpBtn = document.createElement('button');
                helpBtn.className = 'm2-control-btn';
                helpBtn.title = 'Hilfe / Guide';
                helpBtn.innerHTML = '📖';
                helpBtn.onclick = () => window.location.href = '/guide.html';
                right.appendChild(helpBtn);

                const logoutBtn = document.createElement('button');
                logoutBtn.className = 'm2-control-btn with-text';
                logoutBtn.title = 'Logout';
                logoutBtn.innerHTML = '🚪 <span>Logout</span>';
                logoutBtn.onclick = () => window.m2Auth.logout();
                right.appendChild(logoutBtn);
            } else if (!currentPath.includes('login.html') && !currentPath.includes('register.html')) {
                const loginLink = document.createElement('a');
                loginLink.href = '/login.html';
                loginLink.className = 'm2-btn m2-btn-primary';
                loginLink.innerHTML = '🔑 <span>Login</span>';
                right.appendChild(loginLink);
            }

            nav.appendChild(left);
            nav.appendChild(right);

            // Ensure main navbar is unique
            const existing = document.getElementById('m2-navbar');
            if (existing) existing.remove();
            document.body.prepend(nav);

            // ── Sub Navbar (App Links) ──
            const subNav = document.createElement('div');
            subNav.className = 'm2-sub-navbar';
            subNav.id = 'm2-sub-navbar';
            
            const subLinks = document.createElement('div');
            subLinks.className = 'm2-sub-nav-links';
            
            let hasLinks = false;
            this.config.modules.forEach(m => {
                if (m.id === 'dashboard' || m.id === 'item_manager') return;

                const canAccess = window.m2Auth.canAccess(m.access_level);
                if (!canAccess) return;

                hasLinks = true;
                const a = document.createElement('a');
                a.href = m.url;
                const pathSegments = currentPath.split('/').filter(s => s);
                const isActive = pathSegments.includes(m.id) || currentPath.endsWith(m.id) || (m.url !== '/' && currentPath.startsWith(m.url));
                a.className = `m2-sub-nav-item ${isActive ? 'active' : ''}`;
                a.innerHTML = `${m.icon} &nbsp; <span data-i18n="nav.${m.id}">${m.name}</span>`;
                subLinks.appendChild(a);
            });
            
            if (hasLinks) {
                subNav.appendChild(subLinks);
                const exSub = document.getElementById('m2-sub-navbar');
                if (exSub) exSub.remove();
                // Append after main nav
                document.body.insertBefore(subNav, document.body.children[1] || null);
                document.body.classList.add('has-m2-sub-navbar');
            } else {
                // If no modules accessible, maybe don't change padding
                document.body.classList.add('no-sub-navbar-padding'); // Could handle dynamic margin via JS if needed
            }

            document.body.classList.add('has-m2-navbar');
            this.updateNavbarIcons();
        }

        async injectWorkspaceSwitcher(container) {
            if (!container) return;

            try {
                const res = await window.m2Auth.authFetch('/api/workspaces');
                const data = await res.json();
                const workspaces = data?.workspaces || [];
                const activeId = data?.activeId;
                
                const activeWs = workspaces.find(w => w.id === activeId) || { name: 'Persönlich' };

                const dropdown = document.createElement('div');
                dropdown.className = 'm2-dropdown';
                dropdown.innerHTML = `
                    <button class="m2-btn-dropdown" id="m2-ws-toggle">
                        <i class="fas fa-project-diagram"></i>
                        <span>${activeWs.name}</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="m2-dropdown-menu" id="m2-ws-menu">
                        <div class="m2-dropdown-header">Workspaces</div>
                        ${workspaces.map(w => `
                        <a href="#" class="m2-dropdown-item ${w.id === activeId ? 'active' : ''}" data-ws-id="${w.id}">
                                ${w.team_id ? '👥' : '👤'} ${w.name}
                            </a>
                        `).join('')}
                        <div class="m2-dropdown-divider"></div>
                        
                        <!-- Storage Usage -->
                        <div class="m2-storage-status">
                            <div class="m2-storage-label">
                                <span>Speicherplatz</span>
                                <span>${((data.usage || 0) / 1024 / 1024).toFixed(1)}MB / ${((data.limit || 0) / 1024 / 1024).toFixed(0)}MB</span>
                            </div>
                            <div class="m2-storage-bar">
                                <div class="m2-storage-fill ${(data.usage || 0) > (data.limit || 0) * 0.9 ? 'danger' : ''}" style="width: ${Math.min(100, ((data.usage || 0) / (data.limit || 1)) * 100)}%"></div>
                            </div>
                        </div>

                        <div class="m2-dropdown-divider"></div>
                        <a href="/workspaces.html" class="m2-dropdown-item"><i class="fas fa-cog"></i> Workspaces verwalten</a>
                        <a href="/teams.html" class="m2-dropdown-item"><i class="fas fa-users"></i> Teams verwalten</a>
                    </div>
                `;

                container.appendChild(dropdown);

                // Interaction
                const toggle = dropdown.querySelector('#m2-ws-toggle');
                const menu = dropdown.querySelector('#m2-ws-menu');
                
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    menu.classList.toggle('show');
                };

                document.addEventListener('click', () => menu.classList.remove('show'));

                dropdown.querySelectorAll('[data-ws-id]').forEach(item => {
                    item.onclick = async (e) => {
                        e.preventDefault();
                        const id = parseInt(item.getAttribute('data-ws-id'));
                        const sRes = await window.m2Auth.authFetch('/api/workspaces/select', {
                            method: 'POST',
                            body: JSON.stringify({ id })
                        });
                        if (sRes.ok) {
                            window.m2Toast('Workspace gewechselt', 'success');
                            setTimeout(() => window.location.reload(), 500);
                        }
                    };
                });

            } catch (e) {
                console.error('[M2-Layout] WS Error:', e);
            }
        }

        updateNavbarIcons() {
            const btn = document.getElementById('m2-theme-btn');
            if (btn) {
                const theme = window.m2Theme.get();
                btn.innerHTML = `${theme === 'dark' ? '☀️' : '🌙'} <span>Theme</span>`;
                btn.title = `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`;
            }
        }

        updateI18n() {
             // Redo the text inside the navbar if language changes
        }

        /* ── Custom Popups (Modals & Toasts) ─────────────────── */
        
        showToast(message, type = 'info', duration = 4000) {
            let container = document.getElementById('m2-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'm2-toast-container';
                container.className = 'm2-toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
            toast.className = `m2-toast ${type}`;
            toast.innerHTML = `
                <span class="m2-toast-icon">${icons[type] || 'ℹ️'}</span>
                <span class="m2-toast-msg">${message}</span>
            `;
            
            toast.onclick = () => toast.remove();
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.5s forwards';
                setTimeout(() => toast.remove(), 500);
            }, duration);
        }

        showConfirm(title, message, onConfirm, okText = 'Ja', cancelText = 'Nein') {
            this.createModal(title, message, [
                { text: cancelText, class: 'm2-btn-secondary', onclick: (modal) => modal.close() },
                { text: okText, class: 'm2-btn-primary', onclick: (modal) => {
                    if (onConfirm) onConfirm();
                    modal.close();
                }}
            ]);
        }

        showAlert(title, message, okText = 'OK') {
            this.createModal(title, message, [
                { text: okText, class: 'm2-btn-primary', onclick: (modal) => modal.close() }
            ]);
        }

        showPrompt(title, message, onConfirm, defaultValue = '') {
            const content = `
                <p style="margin-bottom:15px; color:var(--text-secondary)">${message}</p>
                <div class="m2-field-group">
                    <input type="text" id="m2-prompt-input" class="m2-input" value="${defaultValue}" autocomplete="off">
                </div>
            `;
            const modalInstance = this.createModal(title, content, [
                { text: 'Abbrechen', class: 'm2-btn-secondary', onclick: (modal) => modal.close() },
                { text: 'Bestätigen', class: 'm2-btn-primary', onclick: (modal) => {
                    const val = document.getElementById('m2-prompt-input').value;
                    if (onConfirm) onConfirm(val);
                    modal.close();
                }}
            ]);
            
            // Auto-focus the input
            setTimeout(() => {
                const input = document.getElementById('m2-prompt-input');
                if (input) {
                    input.focus();
                    input.select();
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            modalInstance.footer.querySelector('.m2-btn-primary').click();
                        }
                    };
                }
            }, 100);
        }

        createModal(title, message, buttonsConfig) {
            const overlay = document.createElement('div');
            overlay.className = 'm2-overlay';
            
            const modal = document.createElement('div');
            modal.className = 'm2-modal';
            
            const modalContent = document.createElement('div');
            modalContent.innerHTML = `
                <h3 class="m2-modal-title">${title}</h3>
                <div class="m2-modal-body">${message}</div>
            `;
            modal.appendChild(modalContent);

            const footer = document.createElement('div');
            footer.className = 'm2-modal-footer';
            buttonsConfig.forEach(btnConfig => {
                const button = document.createElement('button');
                button.className = `m2-btn ${btnConfig.class || ''}`;
                button.textContent = btnConfig.text;
                button.onclick = () => btnConfig.onclick({ close: () => overlay.remove(), footer: footer }); // Pass modal instance with close method
                footer.appendChild(button);
            });
            modal.appendChild(footer);
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            const close = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) close(); };

            return { close: close, footer: footer }; // Return modal instance for external control
        }

        showCommandPalette() {
            const ex = document.getElementById('m2-cmd-palette-overlay');
            if (ex) { ex.remove(); return; }

            const overlay = document.createElement('div');
            overlay.id = 'm2-cmd-palette-overlay';
            overlay.className = 'm2-cmd-overlay';

            const palette = document.createElement('div');
            palette.className = 'm2-cmd-palette';

            const header = document.createElement('div');
            header.className = 'm2-cmd-header';
            header.innerHTML = `
                <span class="m2-cmd-icon">🔍</span>
                <input type="text" class="m2-cmd-input" id="m2-cmd-input" placeholder="Womit kann ich helfen? (Modul, Settings...)" autocomplete="off">
            `;

            const results = document.createElement('div');
            results.className = 'm2-cmd-results';

            palette.appendChild(header);
            palette.appendChild(results);
            overlay.appendChild(palette);
            document.body.appendChild(overlay);

            const input = document.getElementById('m2-cmd-input');
            input.focus();

            const close = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) close(); };

            const commands = [
                { id: 'changelog', title: 'Changelog / Neues ansehen', icon: '⭐', action: () => { close(); this.showChangelog(); } },
                { id: 'theme', title: 'Erscheinungsbild wechseln (Dark/Light)', icon: '🌓', action: () => { close(); window.m2Theme.toggle(); } },
                { id: 'dashboard', title: 'Zum Dashboard', icon: '🏠', action: () => { window.location.href = '/index.html'; } },
            ];

            this.config.modules.forEach(m => {
                if (m.id !== 'dashboard' && m.id !== 'item_manager') {
                    if (window.m2Auth.canAccess(m.access_level)) {
                        commands.push({
                            id: 'mod_' + m.id,
                            title: m.name + ' öffnen',
                            icon: m.icon || '🛠️',
                            shortcut: 'Modul',
                            action: () => { window.location.href = m.url; }
                        });
                    }
                }
            });

            if (window.m2Auth.isLoggedIn()) {
                const u = window.m2Auth.getUser();
                if (u.role === 'admin') {
                    commands.push({ id: 'admin', title: 'Admin Panel', icon: '🛡️', shortcut: 'Admin', action: () => { window.location.href = '/admin.html'; } });
                }
                commands.push({ id: 'account', title: 'Einstellungen / Profil', icon: '👤', action: () => { window.location.href = '/account.html'; } });
                commands.push({ id: 'logout', title: 'Sicher abmelden', icon: '🚪', action: () => { close(); window.m2Auth.logout(); } });
            }

            let filtered = [...commands];
            let selectedIndex = 0;

            const render = () => {
                results.innerHTML = '';
                if (filtered.length === 0) {
                    results.innerHTML = '<div class="m2-cmd-empty">Kein passendes Kommando gefunden.</div>';
                    return;
                }
                filtered.forEach((cmd, idx) => {
                    const item = document.createElement('div');
                    item.className = 'm2-cmd-item' + (idx === selectedIndex ? ' selected' : '');
                    item.innerHTML = `
                        <span class="m2-cmd-item-icon">${cmd.icon}</span>
                        <span class="m2-cmd-item-text">${cmd.title}</span>
                        ${cmd.shortcut ? '<span class="m2-cmd-item-shortcut">' + cmd.shortcut + '</span>' : ''}
                    `;
                    item.onmouseenter = () => { selectedIndex = idx; render(); };
                    item.onclick = cmd.action;
                    results.appendChild(item);
                });
                const selNode = results.querySelector('.selected');
                if (selNode) selNode.scrollIntoView({ block: 'nearest' });
            };

            input.oninput = (e) => {
                const q = e.target.value.toLowerCase();
                filtered = commands.filter(c => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
                selectedIndex = 0;
                render();
            };

            input.onkeydown = (e) => {
                if (e.key === 'Escape') close();
                else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = (selectedIndex + 1) % filtered.length; render(); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length; render(); }
                else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) filtered[selectedIndex].action(); }
            };

            render();
        }

        showChangelog() {
            window.location.href = '/patch_notes.html';
        }
    }

    // Expose Global UI functions
    window.m2Toast = (msg, type, dur) => window.m2Layout?.showToast(msg, type, dur);
    window.m2Confirm = (title, msg, cb, ok, cancel) => window.m2Layout?.showConfirm(title, msg, cb, ok, cancel);
    window.m2Alert = (title, msg, ok) => window.m2Layout?.showAlert(title, msg, ok);
    window.m2Prompt = (title, msg, cb, def) => window.m2Layout?.showPrompt(title, msg, cb, def);

    // Override native ones for convenience (optional but requested "no more chrome popups")
    window.alert = (msg) => window.m2Alert('Information', msg);
    // Note: window.confirm is harder because it's synchronous. 
    // We should encourage using window.m2Confirm instead of overriding native confirm.
    // window.prompt is also synchronous, encourage using window.m2Prompt instead.

    // Initialize Layout
    document.addEventListener('DOMContentLoaded', () => {
        window.m2Layout = new M2Layout();
    });

})();
