# STATUS — Feature Pack Build (2026-08-07)

Plan: docs/superpowers/plans/2026-08-07-feature-pack.md
State: COMPLETE — all features implemented & verified (console assertions + vision-model checks)

## Progress
- [x] Plan doc written
- [x] Wave 1 subagents: asteroid belt / data enrichment / ephemeris
- [x] Controller glue: HTML + script.ts wiring + gui.ts + styles
- [x] Wave 2 subagents: quiz / cinematic tour
- [x] Per-feature verification (console + vision)
- [x] Original Task-6 regression + skip-button commit
- [x] Attribution ("created by Garvit")
- [x] Cleanup: .gitignore covers .playwright-mcp/, .superpowers/, stray PNGs; brainstorm server stopped
- [ ] Deploy: needs user action — create GitHub repo + push (no remote configured, no gh CLI)

## Feature status (all verified)
1. Deploy+attribution — prep done (upstream gh-pages.yaml workflow intact, base /solar-system/, attribution updated); PUSH PENDING USER
2. Asteroid belt — 3200 instanced rocks, GUI toggle, vision-approved
3. Fact card — gravity/moons/distanceAU/escape velocity/fun fact, "—" fallbacks, vision-approved
4. Ephemeris — real J2000 mean longitudes; angles match formula (~1e-5 rad), deterministic
5. True scale — Sun 109×, rings inherit parent factor, camera snap, bloom tamed, vision-approved
6. Hover tooltip — 3D raycast name chip at cursor
7. Moon focus — Ganymede/Titan etc. clickable; fixed path-raycast + stale-aspect bugs that broke clicks
8. Time controls — speed presets (×0.125/×1/×10/×100), reverse, sim-date HUD (verified ±)
9. Quiz — 6/6 round E2E via 3D clicks, best score persisted (solar-quiz-best)
11. Auto tour — Sun→Neptune bezier flights, cards open, pointerdown cancels

## Bugs found & fixed during verification
- Orbit path Lines intercepted raycasts (Moon's path circle captured every click from Earth focus) → path.raycast = noop
- Stale projection aspect after resize (fakeCamera never updated) → resize handler updates fakeCamera too
- True-scale camera flew 57,000 units out (mesh scale × camera local offset) → local-space OrbitControls clamps
- Hidden spotlight controls blocked caption arrows (pointer-events auto while opacity 0) → scoped to .visible
- Giant Sun bloom blob in true-scale → bloom strength 0.75 → 0.15 on toggle

## Deploy next steps (user)
1. Create GitHub repo (e.g. `solar-system`), push this repo: git remote add origin <url> && git push -u origin master
2. GitHub → Settings → Pages → Source: GitHub Actions (workflow .github/workflows/gh-pages.yaml already present)
3. Or locally: ./scripts/deploy-gh-pages.sh <remote-url> (pushes dist to gh-pages branch)
4. Optionally update the GitHub button link in src/index.html to the new repo URL
