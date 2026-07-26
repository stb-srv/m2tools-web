# Quest Builder – Lua-Syntax-Referenz

Diese Doku dokumentiert, welche Lua-Syntax der Quest Builder (`frontend/src/modules/quest-builder/`) generiert und importiert – und wie sicher diese Syntax ist. Grundlage ist ein Abgleich der Generator-Logik (`questLua.js`) gegen **870 echte, produktive `.quest`-Dateien** aus `share/quest/` (u. a. `Biologie/`, `Gilde/`, `Events/`, `Sonstiges/`, `object/<vnum>/`).

## Vertrauensgrad-Legende

- ✅ **Verifiziert** – mindestens einmal wortgleich (bis auf VNUMs) in den 870 realen Dateien gefunden.
- ⚠️ **Nicht belegt** – kommt in den 870 Dateien kein einziges Mal vor. Nicht zwangsläufig falsch (kann eine reale, nur ungenutzte QuestLib-Funktion sein), aber vor Produktiveinsatz gegen die QuestLib deines Server-Cores prüfen.
- ❌ **Korrigiert** – war vorher im Tool falsch/anders implementiert und wurde aufgrund der realen Belege geändert.

## Trigger (`when ... begin`)

| Typ (UI) | Generierter Code | Status | Beleg |
|---|---|---|---|
| NPC Klick | `when <npcVnum>.click begin` | ✅ | 16× in Biologie/Sonstiges |
| Monster töten | `when <mobVnum>.kill begin` | ❌ korrigiert | War vorher `when kill with npc.get_race() == X begin` – kommt **kein einziges Mal** in 870 Dateien vor. Echte Syntax ist identisch zu `.click`/`.use`, siehe `quest/Biologie/Orkzahn.lua:71`: `when 601.kill begin`. Mehrere Monster lassen sich per `or` verketten (`when 631.kill or 632.kill or ... begin`) – das unterstützt der Editor aktuell nicht direkt; als Workaround mehrere Kill-Trigger im selben State anlegen (Multi-Trigger-Feature). |
| Item benutzen | `when <itemVnum>.use begin` | ✅ | 16× |
| Login | `when login begin` | ✅ | 4× (auch kombiniert: `when login or levelup with pc.level >= N begin`) |
| Level-Up | `when levelup begin` | ✅ | Teil der Login-Kombination oben |
| Chat-Befehl | `when <npcVnum>.chat."<text>" begin` | ✅ | `quest/Sonstiges/Energie_System.lua`: `when 20038.chat."Hallo!" begin`. War vorher fälschlich `when letter with chat == "..."` (vermischte das Brief-System mit Chat) – korrigiert. |
| Quest-Button | `when button begin` | ✅ | 1× bare, 11× als `when button or info begin` (das Tool generiert nur den einfachen `button`-Fall; `or info` müsstest du per `custom_lua`/manueller Nachbearbeitung ergänzen, falls dein Server das für dieselbe Aktion braucht). |
| Brief erhalten | `when letter begin` | ✅ | **Häufigster Trigger überhaupt** (41×). Kein Ziel; wird fast immer als "State-Einstiegspunkt" genutzt, der per `send_letter(...)` den nächsten Brief verschickt. War vorher im Tool komplett nicht vorhanden – neu ergänzt. |
| Timer | `when <name>.timer begin` | ⚠️ nicht belegt | Kommt in den 870 Dateien kein einziges Mal vor (dieser Server nutzt stattdessen das Letter/State-Muster für Verzögerungen). Aus allgemeinem QuestLib-Wissen übernommen – vor Nutzung testen. |
| Spielwelt betreten | `when enter begin` | ⚠️ nicht belegt | Ebenfalls 0 Treffer. |

Nicht im Tool abgebildet, aber real vorhanden und ggf. für zukünftige Erweiterung interessant: `when <vnum>.take begin` (Item vom Boden aufheben), `when <vnum>.pick begin` (Boden-Sammelobjekt).

## Aktionen

| Aktion (UI) | Generierter Code | Status |
|---|---|---|
| Item geben | `pc.give_item2(vnum, amount)` | ✅ 65× |
| Item entfernen | `pc.remove_item(vnum, amount)` | ✅ 46× |
| Gold geben/entfernen | `pc.change_gold(±amount)` | ✅ 6× (Alias `pc.changegold(...)` ohne Unterstrich ist mit 11× sogar häufiger, aber `change_gold` ist ebenfalls real und die dokumentierte Form) |
| Flag setzen / Zähler +1 | `pc.setqf("name", wert)` / `pc.setqf("name", pc.getqf("name") + 1)` | ✅ 117×/94× – mit Abstand die meistgenutzte Funktion überhaupt |
| Brief senden | `send_letter("titel")` | ✅ Kernbestandteil des Letter-Musters |
| Teleportieren | `pc.warp(x, y)` | ✅ 17× |
| Attribut-Bonus | `affect.add_collect(apply.TYP, wert, dauer)` | ✅ 27×, sogar die "Permanent"-Konstante `60*60*24*365*60` exakt so in `Orkzahn.lua:209` gefunden |
| State-Wechsel | `set_state("name")` | ✅ als Lua-String funktional korrekt. In den realen Dateien meist **unquotiert** (`set_state(information)`) – das ist aber Zucker eines projekteigenen Präprozessors (`quest/pre_qc.py` + `qc_x64`-Compiler), keine Kernsprache. Die quotierte Form ist die sichere, compilerunabhängige Variante. |
| Monster spawnen | `mob.spawn(vnum, x, y, 1, 1, 1)` | ⚠️ nicht belegt |
| Timer starten/stoppen | `timer(...)` / `cleartimer(...)` | ⚠️ nicht belegt |
| Nachricht | `notice("text")` | ⚠️ nicht belegt (dieser Server nutzt stattdessen `notice_all(...)` – 13× – das an **alle** Spieler sendet statt nur an den aktuellen; ggf. für eine künftige "Broadcast"-Aktion interessant) |

## Bedingungen (`if ... then`)

| Bedingung (UI) | Generierter Code | Status |
|---|---|---|
| Level-Check | `pc.get_level() OP wert` | ✅ 22× (Alias `pc.level` ohne Klammern ebenfalls 20× belegt, beide funktionieren) |
| Item-Check | `pc.count_item(vnum) OP wert` | ✅ 90× |
| Klassen-Check | `pc.get_job() == wert` | ✅ 9× |
| Fortschritt/Quest-Zähler | `pc.getqf("name") OP wert` | ✅ (Kehrseite von `setqf`, 94× belegt) |
| Gold-Check | `pc.money() OP wert` | ⚠️ nicht belegt (Item-/Level-Checks dominieren in diesem Korpus) |
| Rangpunkte (Alignment) | `pc.get_alignment() OP wert` | ⚠️ nicht belegt |

## Verzweigung (`select()`)

✅ **Vollständig verifiziert**, exakt wie generiert:

```lua
local s = select("Ja", "Nein")
if s == 1 then
    ...
elseif s == 2 then
    ...
end
```

Beleg: `quest/Events/OX_Event.lua:24` u. a.

## Serverspezifische Erweiterungen außerhalb des Tool-Umfangs

Der reale Korpus nutzt eine projekteigene Lua-Bibliothek (`quest/dofiles/GFquestlib.lua`, `questing.lua`) mit Funktionen für Gilden (`pc.hasguild()`, `npc.get_guild()`, `pc.is_guild_master()`), Heirat (`pc.is_married()`, `marriage.in_my_wedding()`), Reittiere (`horse.get_level()`), NPC-Locking (`npc.lock()`/`npc.unlock()`) und ein Ziel-System (`target.vid(...)`, `target.delete(...)`). Diese sind zu serverspezifisch für generische UI-Felder im Quest Builder – nutze dafür die Aktion **"Eigener Lua-Code"** (`custom_lua`), die unverändert durchgereicht wird.

## Import/Export

Der Import-Parser (`parseQuestCode` in `questLua.js`) ist darauf ausgelegt, **vom Tool selbst exportierten** Code verlässlich zurückzulesen (inkl. verschachtelter Bedingungen, `select()`-Verzweigungen und mehrzeiligem `custom_lua`-Code) – nicht beliebigen, von Hand geschriebenen Lua-Code aus dem realen Korpus. Von Hand geschriebene reale Quests (z. B. mit Gilden-/Heirats-Funktionen, `target.vid(...)`-Mustern oder dem `letter`+`button or info`-Dreiklang) lassen sich zwar öffnen, aber nicht erkannte Konstrukte landen als `custom_lua`-Aktion, nicht als strukturierte Felder.
