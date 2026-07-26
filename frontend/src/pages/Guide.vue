<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const NAV_ITEMS = [
    { id: 'intro', icon: '▶️', label: 'Einführung' },
    { id: 'workspaces', icon: '📂', label: 'Workspaces' },
    { id: 'settings', icon: '⚙️', label: 'Daten & Icons' },
    { id: 'quest-syntax', icon: '📜', label: 'Quest-Syntax' },
    { id: 'teams', icon: '👥', label: 'Team-Arbeit' },
    { id: 'quota', icon: '💾', label: 'Speicher & Limits' },
    { id: 'admin', icon: '🛡️', label: 'Admin-Übersicht' }
];

const activeSection = computed(() => {
    const page = route.query.page;
    return NAV_ITEMS.some(n => n.id === page) ? page : 'intro';
});

function showSection(id) {
    router.replace({ query: { ...route.query, page: id } });
}
</script>

<template>
    <div class="guide-container">
        <aside class="guide-sidebar">
            <ul class="guide-nav">
                <li
                    v-for="item in NAV_ITEMS"
                    :key="item.id"
                    class="guide-nav-item"
                    :class="{ active: activeSection === item.id }"
                    @click="showSection(item.id)"
                >
                    {{ item.icon }} {{ item.label }}
                </li>
            </ul>
        </aside>

        <div class="guide-content">
            <section v-show="activeSection === 'intro'" class="section active">
                <div class="guide-header">
                    <h1>Willkommen zum M2-Tools Guide</h1>
                    <p>Lerne, wie du deine Entwicklungsprojekte effizient verwaltest und mit anderen zusammenarbeitest.</p>
                </div>
                <p>M2-Tools ist kein einfaches Webtool, sondern ein komplettes Toolkit für die Metin2-Entwicklung. Durch das neue Workspace-System kannst du mehrere Server-Projekte gleichzeitig verwalten, ohne jemals Daten zu vermischen.</p>
                <div class="feature-card">
                    <h3 style="margin-bottom: 15px;">🚀 Die Kernkonzepte</h3>
                    <ul class="step-list" style="margin-bottom: 0;">
                        <li><strong>Isolation:</strong> Jeder Workspace hat seine eigenen Icons, seine eigene Datenbank und seine eigenen Log-Dateien.</li>
                        <li><strong>Kollaboration:</strong> Arbeite in Echtzeit mit Kollegen in gemeinsamen Teams zusammen.</li>
                        <li><strong>Performance:</strong> Alle Daten werden serverseitig geladen und optimiert, für maximale Geschwindigkeit in deinem Browser.</li>
                    </ul>
                </div>
            </section>

            <section v-show="activeSection === 'workspaces'" class="section">
                <div class="guide-header">
                    <h1>📁 Workspaces verwalten</h1>
                    <p>Dein Projekt-Profil für jeden Server.</p>
                </div>
                <p>Ein Workspace fungiert wie eine "virtuelle Maschine" für deine Spieldaten. Wenn du einen Workspace aktivierst, passen sich alle Editoren (Cube, Quest, Drop) automatisch an diesen Datensatz an.</p>
                <ul class="step-list">
                    <li><strong>Workspace erstellen:</strong> Klicke auf dem Dashboard oder in der Navigation auf "Workspaces" und dann oben rechts auf "+ Neuen Workspace anlegen".</li>
                    <li><strong>Projekt-Pfad:</strong> Du kannst einen optionalen Pfad angeben (z.B. <code>D:\Server\share\locale\germany\</code>). Dies hilft dem System, Exporte direkt dort abzulegen.</li>
                    <li><strong>Aktivierung:</strong> In der Liste klickst du auf den blauen "Aktivieren" Button. Nur der aktive Workspace wird in den Editoren geladen.</li>
                </ul>
                <div class="alert-box">
                    ⚠️
                    <div><strong>Wichtig:</strong> Wenn du keinen Workspace aktiviert hast, arbeitet das System im "Persönlichen Modus" mit Standarddaten.</div>
                </div>
            </section>

            <section v-show="activeSection === 'settings'" class="section">
                <div class="guide-header">
                    <h1>⚙️ Eigene Daten & Icons</h1>
                    <p>Bringe deine Datenbank und Grafiken in den Browser.</p>
                </div>
                <h3>📤 Daten hochladen</h3>
                <p>Über den Button <strong>Settings</strong> in der Workspace-Liste gelangst du zur Upload-Zentrale.</p>
                <ul class="step-list">
                    <li><strong>item_proto & mob_proto:</strong> Lade deine <code>proto.db</code> hoch. Ab diesem Moment werden im Cube-Editor oder Quest-Builder nur noch exakt die Items und Mobs vorgeschlagen, die dein Server kennt.</li>
                    <li><strong>Icon-Support:</strong> Erstelle ein ZIP-Archiv mit deinen Item-Icons (<code>vnum.png</code> oder <code>vnum.tga</code>) und lade es hoch. Das System zeigt diese Icons nun überall als Vorschau an.</li>
                </ul>
                <div class="pro-tip">
                    💡
                    <div><strong>Pro-Tipp für Icons:</strong> Du kannst das ZIP einfach so lassen, wie es ist. Das System entpackt es serverseitig in Millisekunden und indiziert alle Icons automatisch für dich.</div>
                </div>
            </section>

            <section v-show="activeSection === 'quest-syntax'" class="section">
                <div class="guide-header">
                    <h1>📜 Quest-Syntax verstehen</h1>
                    <p>Was jeder Trigger, jede Aktion und jede Bedingung im Quest Builder wirklich erzeugt.</p>
                </div>

                <p>Diese Referenz wurde gegen <strong>870 echte, produktive Metin2-Quest-Dateien</strong> abgeglichen, nicht nur aus der Erinnerung geschrieben. Jede Zeile ist entweder als real vorkommend belegt (✅) oder ausdrücklich als unbelegt markiert (⚠️) – dann lieber vor dem Produktiveinsatz gegen deine eigene QuestLib testen.</p>

                <div class="feature-card">
                    <h3 style="margin-bottom: 15px;">🧩 Grundaufbau eines Quests</h3>
                    <ul class="step-list" style="margin-bottom: 0;">
                        <li><strong>Quest:</strong> Der äußere Rahmen (<code>quest name begin ... end</code>). Der Name darf nur Buchstaben, Zahlen und Unterstriche enthalten.</li>
                        <li><strong>State:</strong> Ein "Kapitel" des Quests (<code>state name begin ... end</code>). Jeder Quest startet automatisch im State <code>start</code>. Mit Aktionen wie "State-Wechsel" bewegst du den Spieler von einem State zum nächsten.</li>
                        <li><strong>Trigger:</strong> Ein Ereignis, das den Code in einem State auslöst (<code>when ... begin ... end</code>). Ein State kann <em>mehrere</em> Trigger gleichzeitig haben – z.B. einen Klick- <em>und</em> einen Kill-Trigger im selben State (siehe Beispiel unten).</li>
                    </ul>
                </div>

                <h3 style="margin-top:35px">⚡ Trigger-Referenz</h3>
                <div class="table-wrap">
                    <table class="guide-table">
                        <thead><tr><th>Trigger</th><th>Generierter Code</th><th>Wann löst er aus?</th><th></th></tr></thead>
                        <tbody>
                            <tr><td>👤 NPC Klick</td><td><code>when &lt;npcVnum&gt;.click begin</code></td><td>Spieler klickt den gewählten NPC an.</td><td>✅</td></tr>
                            <tr><td>⚔️ Monster töten</td><td><code>when &lt;vnum&gt;.kill begin</code> (mehrere: <code>A.kill or B.kill or ...</code>)</td><td>Spieler tötet eines der gewählten Monster. Mehrere Monster können im Editor per "Monster hinzufügen" ergänzt werden.</td><td>✅</td></tr>
                            <tr><td>🎒 Item benutzen</td><td><code>when &lt;itemVnum&gt;.use begin</code></td><td>Spieler benutzt das gewählte Item im Inventar.</td><td>✅</td></tr>
                            <tr><td>🔑 Login</td><td><code>when login begin</code></td><td>Spieler loggt sich ein.</td><td>✅</td></tr>
                            <tr><td>⬆️ Level-Up</td><td><code>when levelup begin</code></td><td>Spieler steigt ein Level auf.</td><td>✅</td></tr>
                            <tr><td>💬 Chat-Befehl</td><td><code>when &lt;npcVnum&gt;.chat."&lt;text&gt;" begin</code></td><td>Spieler steht beim NPC und tippt genau diesen Text in den Chat.</td><td>✅</td></tr>
                            <tr><td>🔘 Quest-Button</td><td><code>when button begin</code></td><td>Spieler drückt den Quest-Button im Client (spielweit, kein Ziel).</td><td>✅</td></tr>
                            <tr><td>📩 Brief erhalten</td><td><code>when letter begin</code></td><td>Spieler öffnet einen Brief, der zuvor per "Brief senden" verschickt wurde. Der häufigste Trigger in echten Quests – meist der erste Trigger eines neuen States.</td><td>✅</td></tr>
                            <tr><td>⏱️ Timer</td><td><code>when &lt;name&gt;.timer begin</code></td><td>Ein zuvor gestarteter Timer läuft ab.</td><td>⚠️</td></tr>
                            <tr><td>🚪 Spielwelt betreten</td><td><code>when enter begin</code></td><td>Spieler betritt die Spielwelt (nach Login).</td><td>⚠️</td></tr>
                        </tbody>
                    </table>
                </div>

                <h3 style="margin-top:35px">⚙️ Aktionen-Referenz</h3>
                <div class="table-wrap">
                    <table class="guide-table">
                        <thead><tr><th>Aktion</th><th>Generierter Code</th><th>Was passiert?</th></tr></thead>
                        <tbody>
                            <tr><td>🎁 Item geben</td><td><code>pc.give_item2(vnum, anzahl)</code></td><td>Legt das Item ins Inventar (oder auf den Boden, wenn voll).</td></tr>
                            <tr><td>❌ Item entfernen</td><td><code>pc.remove_item(vnum, anzahl)</code></td><td>Entfernt das Item aus dem Inventar.</td></tr>
                            <tr><td>💰 Gold geben/entfernen</td><td><code>pc.change_gold(±betrag)</code></td><td>Ändert das Gold des Spielers.</td></tr>
                            <tr><td>🔄 State-Wechsel</td><td><code>set_state("name")</code></td><td>Springt in einen anderen State desselben Quests.</td></tr>
                            <tr><td>🏁 Flag setzen</td><td><code>pc.setqf("name", wert)</code></td><td>Speichert einen Fortschrittswert pro Spieler und Quest (übersteht Logout).</td></tr>
                            <tr><td>📈 Quest-Zähler +1</td><td><code>pc.setqf("n", pc.getqf("n") + 1)</code></td><td>Erhöht einen Flag-Wert um 1 - der Klassiker für "Töte X Monster"-Zähler.</td></tr>
                            <tr><td>✉️ Brief senden</td><td><code>send_letter("titel")</code></td><td>Schickt dem Spieler einen Brief, den er öffnen muss - das Öffnen löst den "Brief erhalten"-Trigger aus.</td></tr>
                            <tr><td>🌀 Teleportieren</td><td><code>pc.warp(x, y)</code></td><td>Versetzt den Spieler zu den angegebenen Koordinaten.</td></tr>
                            <tr><td>👹 Monster spawnen</td><td><code>mob.spawn(vnum, x, y, 1, 1, 1)</code></td><td>Erzeugt ein Monster an der aktuellen Position. ⚠️ unbelegt.</td></tr>
                            <tr><td>⏱️ Timer starten/stoppen</td><td><code>timer(...)</code> / <code>cleartimer(...)</code></td><td>Startet/stoppt einen benannten Timer. ⚠️ unbelegt.</td></tr>
                            <tr><td>📢 Nachricht</td><td><code>notice("text")</code></td><td>Zeigt dem Spieler eine Systemnachricht an. ⚠️ unbelegt.</td></tr>
                            <tr><td>🌟 Attribut-Bonus</td><td><code>affect.add_collect(apply.TYP, wert, dauer)</code></td><td>Gibt einen dauerhaften oder befristeten Statuswert-Bonus.</td></tr>
                            <tr><td>📝 Eigener Lua-Code</td><td>wird 1:1 übernommen</td><td>Fluchttür für alles, was die UI nicht abdeckt (Gilden-, Heirats-, Reittier-Funktionen deiner QuestLib etc.).</td></tr>
                        </tbody>
                    </table>
                </div>

                <h3 style="margin-top:35px">🔍 Bedingungen-Referenz</h3>
                <div class="table-wrap">
                    <table class="guide-table">
                        <thead><tr><th>Bedingung</th><th>Generierter Code</th></tr></thead>
                        <tbody>
                            <tr><td>⬆️ Level-Check</td><td><code>pc.get_level() OP wert</code></td></tr>
                            <tr><td>🎒 Item-Check</td><td><code>pc.count_item(vnum) OP wert</code></td></tr>
                            <tr><td>💰 Gold-Check</td><td><code>pc.money() OP wert</code></td></tr>
                            <tr><td>🛡️ Klassen-Check</td><td><code>pc.get_job() == wert</code></td></tr>
                            <tr><td>🏁 Fortschritt / Quest-Zähler</td><td><code>pc.getqf("name") OP wert</code></td></tr>
                        </tbody>
                    </table>
                </div>
                <p>Mehrere Bedingungen werden mit <code>and</code> verknüpft und in <code>if ... then ... end</code> um den restlichen Trigger-Code gelegt - erst wenn <em>alle</em> Bedingungen zutreffen, laufen Dialog/Aktionen/Verzweigung.</p>

                <h3 style="margin-top:35px">❓ Verzweigung mit select()</h3>
                <p>Gibst du dem Spieler mehrere Auswahlmöglichkeiten, erzeugt der Editor:</p>
                <pre class="code-example"><code>local s = select("Option A", "Option B")
if s == 1 then
    -- Aktionen von Option A
elseif s == 2 then
    -- Aktionen von Option B
end</code></pre>

                <div class="alert-box">
                    ⚠️
                    <div><strong>Grenzen des Editors:</strong> Serverspezifische Funktionen (Gilden, Heirat, Reittiere, Ziel-System) bildet die UI nicht ab - dafür gibt es die Aktion "Eigener Lua-Code".</div>
                </div>

                <h3 style="margin-top:35px">📖 Beispiel-Quest zum Nachvollziehen</h3>
                <p>
                    Diese komplette Quest kannst du direkt im Quest Builder laden: Schritt 1 → <router-link to="/modules/quest_builder/index.html">Quest Builder öffnen</router-link> → Button
                    <strong>"📖 Referenz-Beispiel (alle Bausteine)"</strong>. Sie nutzt bewusst jeden Baustein einmal, inklusive Multi-Trigger pro State.
                </p>
                <pre class="code-example"><code>quest referenz_beispiel begin
	state start begin
		when 20011.click begin
			if pc.get_level() &gt;= 5 then
				say_title("Uriel")
				say("Ich brauche deine Hilfe!")
				say("Töte 5 Wildschweine und kehre zu mir zurück.")
				local s = select("Ich helfe dir!", "Kein Interesse.")
				if s == 1 then
					pc.setqf("boar_kills", 0)
					set_state("jagd")
				elseif s == 2 then
				end
			end
		end
	end
	state jagd begin
		when 20110.kill begin
			pc.setqf("boar_kills", pc.getqf("boar_kills") + 1)
			if pc.getqf("boar_kills") &gt;= 5 then
    notice("Genug Wildschweine erlegt! Kehre zu Uriel zurück.")
    set_state("belohnung")
end
		end
		when 20011.click begin
			say_title("Uriel")
			say("Wie weit bist du?")
		end
	end
	state belohnung begin
		when 20011.click begin
			say_title("Uriel")
			say("Gut gemacht! Hier ist dein Lohn.")
			pc.give_item2(50100, 1)
			pc.change_gold(5000)
			set_state("fertig")
		end
	end
	state fertig begin
		when letter begin
			send_letter("Quest abgeschlossen!")
		end
		when 20011.click begin
			say("Danke nochmal für deine Hilfe!")
		end
	end
end</code></pre>

                <h4 style="margin-top:25px; color: var(--text-heading);">Zeile für Zeile</h4>
                <ul class="step-list">
                    <li><strong>State "start":</strong> Der Spieler klickt NPC 20011 (Uriel) an. Die Bedingung <code>pc.get_level() &gt;= 5</code> sorgt dafür, dass zu niedrige Level erst gar keinen Dialog sehen. Dann folgt ein Titel, zwei Dialogzeilen und eine Auswahl mit zwei Optionen. Wählt der Spieler "Ich helfe dir!", wird der Zähler <code>boar_kills</code> auf 0 gesetzt und in den State <code>jagd</code> gewechselt. Bei "Kein Interesse." passiert nichts (leere Aktionsliste) - der Spieler bleibt in <code>start</code> und kann es später erneut versuchen.</li>
                    <li><strong>State "jagd" hat zwei gleichzeitig aktive Trigger:</strong> Der Kill-Trigger (<code>20110.kill</code>, VNUM des "boar"-Monsters) erhöht bei jedem Kill den Zähler und prüft per "Eigener Lua-Code", ob 5 erreicht sind - wenn ja, Nachricht + Wechsel zu <code>belohnung</code>. <em>Gleichzeitig</em> reagiert derselbe State auf einen erneuten Klick auf Uriel mit einer Status-Antwort ("Wie weit bist du?"), ohne den Fortschritt zu beeinflussen. Genau das ist der Multi-Trigger-Anwendungsfall.</li>
                    <li><strong>State "belohnung":</strong> Klick auf Uriel gibt Item (VNUM 50100) und 5000 Gold, dann Wechsel zu <code>fertig</code>.</li>
                    <li><strong>State "fertig":</strong> Zeigt das Letter-Muster - ein Brief-Trigger ohne Ziel, der (sobald irgendwo im Quest ein <code>send_letter(...)</code> darauf verweist) beim Öffnen des Briefes reagiert. Zusätzlich reagiert derselbe State weiterhin auf Klicks auf Uriel mit einer Abschluss-Zeile.</li>
                </ul>

                <div class="pro-tip">
                    💡
                    <div><strong>Import/Export:</strong> Der Quest Builder kann jeden Code, den er selbst exportiert hat, auch wieder fehlerfrei importieren - inklusive Bedingungen, Verzweigungen und mehrzeiligem eigenem Lua-Code. Von Hand geschriebenen, fremden Quest-Code kann er ebenfalls öffnen, aber nicht erkannte Konstrukte (z.B. serverspezifische Gilden-/Heirats-Funktionen) landen dann als "Eigener Lua-Code"-Block statt als strukturierte Felder.</div>
                </div>
            </section>

            <section v-show="activeSection === 'teams'" class="section">
                <div class="guide-header">
                    <h1>👥 Team-Arbeit</h1>
                    <p>Gemeinsam entwickeln macht mehr Spaß.</p>
                </div>
                <p>Teams erlauben es dir, deinen Workspace mit anderen Benutzern zu teilen, ohne dein Passwort preiszugeben.</p>
                <ul class="step-list">
                    <li><strong>Team erstellen:</strong> Gehe zu "Teams" und klicke auf "Neues Team erstellen".</li>
                    <li><strong>Besitzer-Rolle:</strong> Als Ersteller bist du der Besitzer und kannst jederzeit Mitglieder hinzufügen oder entfernen.</li>
                    <li><strong>Workspace zuweisen:</strong> Bearbeite einen Workspace und wähle unter "Team" dein erstelltes Team aus. Ab jetzt können alle Teammitglieder diesen Workspace sehen und aktiv nutzen.</li>
                </ul>
            </section>

            <section v-show="activeSection === 'quota'" class="section">
                <div class="guide-header">
                    <h1>💾 Speicherplatz & Limits</h1>
                    <p>Alles über Speicher-Quotas.</p>
                </div>
                <p>Um die Server-Stabilität zu gewährleisten, gibt es für jeden Account Speicherplatz-Limits für Workspaces.</p>
                <ul class="step-list">
                    <li><strong>Standard-User:</strong> Haben in der Regel ein Limit von 20MB (ausreichend für DBs und einige hundert Icons).</li>
                    <li><strong>Premium-User:</strong> Genießen erweiterte Limits (z.B. 50MB oder mehr) für umfangreiche Icon-Sammlungen.</li>
                </ul>
                <div class="alert-box">
                    ℹ️
                    <div>Deine aktuelle Auslastung siehst du jederzeit oben rechts in der Navigation neben deinem Profilbild.</div>
                </div>
            </section>

            <section v-show="activeSection === 'admin'" class="section">
                <div class="guide-header">
                    <h1>🛡️ Admin-Optionen</h1>
                    <p>Informationen für Server-Betreiber.</p>
                </div>
                <p>Wenn du die Rolle <strong>Admin</strong> hast, kannst du im Admin Panel globale Limits festlegen:</p>
                <ul class="step-list">
                    <li><strong>Maximale Teams:</strong> Begrenze, in wie vielen Teams ein Nutzer gleichzeitig Mitglied sein darf.</li>
                    <li><strong>Workspace-Anzahl:</strong> Schütze den Disk-Space, indem du die Anzahl der Workspaces pro Nutzer limitierst.</li>
                    <li><strong>Modul-Steuerung:</strong> Aktiviere oder deaktiviere Module für bestimmte Nutzer-Rollen oder Gäste.</li>
                </ul>
            </section>
        </div>
    </div>
</template>

<style scoped>
.guide-container {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 40px;
    max-width: 1400px;
    margin: 40px auto;
    padding: 0 20px;
}

.guide-sidebar { position: sticky; top: 100px; height: fit-content; }

.guide-nav { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; list-style: none; }

.guide-nav-item {
    padding: 12px 15px; margin-bottom: 5px; border-radius: var(--radius-sm);
    cursor: pointer; transition: var(--transition);
    display: flex; align-items: center; gap: 12px; color: var(--text-secondary);
}
.guide-nav-item:hover { background: var(--bg-hover); color: var(--text-heading); }
.guide-nav-item.active { background: rgba(212, 175, 55, 0.1); color: var(--gold-primary); border-left: 3px solid var(--gold-primary); }

.guide-content { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 50px; min-height: 80vh; }

.section { animation: fadeIn 0.4s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.guide-header { margin-bottom: 40px; }
.guide-header h1 { font-size: 2.5rem; color: var(--gold-primary); margin-bottom: 10px; }
.guide-header p { font-size: 1.1rem; color: var(--text-secondary); }

.feature-card { background: var(--bg-input); border-radius: var(--radius-sm); padding: 25px; margin-top: 30px; border-left: 4px solid var(--gold-primary); }

.step-list { margin: 25px 0; padding-left: 20px; }
.step-list li { margin-bottom: 15px; color: var(--text-secondary); line-height: 1.6; }
.step-list strong { color: var(--text-heading); }

.pro-tip {
    background: rgba(40, 167, 69, 0.05); border: 1px solid rgba(40, 167, 69, 0.2);
    padding: 15px 20px; border-radius: var(--radius-sm); margin-top: 25px;
    display: flex; gap: 15px; align-items: flex-start;
}

.alert-box {
    background: rgba(212, 175, 55, 0.05); border: 1px solid rgba(212, 175, 55, 0.2);
    padding: 15px 20px; border-radius: var(--radius-sm); margin-top: 25px;
    display: flex; gap: 15px; align-items: flex-start;
}

.guide-content :deep(code) { background: #000; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.9rem; }

.table-wrap { overflow-x: auto; margin: 20px 0; }
.guide-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.guide-table th, .guide-table td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.guide-table th { color: var(--gold-primary); font-weight: 700; white-space: nowrap; }
.guide-table td:first-child { white-space: nowrap; font-weight: 600; color: var(--text-heading); }
.guide-table tbody tr:hover { background: var(--bg-hover); }

.code-example {
    background: #0d0d14; border: 1px solid var(--border-color); border-radius: var(--radius-sm);
    padding: 20px; overflow-x: auto; font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.85rem; line-height: 1.7; color: #d4d4d4; white-space: pre; margin: 15px 0 25px;
}
:global([data-theme="light"]) .code-example { background: #f5f2eb; color: #2a2a2a; }

@media (max-width: 900px) {
    .guide-container { grid-template-columns: 1fr; }
    .guide-sidebar { position: static; margin-bottom: 30px; }
    .guide-content { padding: 30px; }
}
</style>
