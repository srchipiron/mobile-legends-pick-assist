# Lo que viene de ECC

[ECC](https://github.com/affaan-m/ECC) («Everything Claude Code», licencia MIT,
copia en `LICENSE`) es un plugin de Claude Code con cientos de agentes y
habilidades. Declararlo en `.claude/settings.json` NO lo instala en las
sesiones en la nube (comprobado el 5 de octubre de 2026: la lista de plugins
instalados estaba vacía y no había ninguna habilidad suya). Por eso las piezas
que sirven a ESTE proyecto van copiadas aquí, adaptadas, y se cargan en todas
las sesiones (nube, móvil, ordenador) sin instalar nada.

Copiadas del commit `ef648e0` (1 de octubre de 2026) y adaptadas:

| Aquí | En ECC | Qué se cambió |
|---|---|---|
| `.claude/agents/silent-failure-hunter.md` | `agents/silent-failure-hunter.md` | la lista de fallos silenciosos de este proyecto y los «conservo lo anterior» que son a propósito |
| `.claude/skills/click-path-audit/SKILL.md` | `skills/click-path-audit/SKILL.md` | los hooks de estado de la app (useDraft, usePersonal…) en vez de Zustand |
| `.claude/agents/security-reviewer.md` | `agents/security-reviewer.md` | las reglas de la cuenta de Javi: el lector solo hace captura, el token solo va a GitHub |
| `.claude/agents/pr-test-analyzer.md` | `agents/pr-test-analyzer.md` | la regla de mutación: una prueba vale si falla al romper lo que vigila |

Lo que NO se trajo, y por qué: los hooks (pueden reescribir mandatos y mandar
texto a otro modelo; aquí ya hay guardarraíles propios), las piezas de otros
lenguajes y oficios (Django, Go, Solidity, sanidad, logística…), y las genéricas
que este proyecto ya tiene mejor (`/iterar` hace de revisión y plan; las
pruebas de navegador, de QA en navegador). CLAUDE.md manda sobre todo esto.
