# Edison Format (TCG March 2010) — Compliance Roadmap

Target: play Edison correctly — the metagame as of SJC Edison, NJ (March 13–14, 2010).
Rules of the Master Rule 1 era, March 1 2010 TCG banlist, card pool frozen at that date,
and every card behaving with its 2010 text (pre-errata where needed).

Legend: `[x]` done · `[~]` believed working but unverified · `[ ]` missing

Cross-repo scope: `evolution-card-game` (client), `EDOpro-server-ts` (server),
`evolution-assets` (lflist/cdb/scripts), `server-formats-cdb` (reference data).

---

## 1. Game rules — Master Rule 1 era (`duel_rule = 1`)

The engine chain (koishipro-core.js ← purerosefallen/ygopro-core ← Fluorohydride)
derives era semantics from `duel_rule` encoded in the high 16 bits of the
`startDuel()` options. The server already sends it:
`RuleMappings.ts:405` → `calculate-duel-options.ts:12` (`duel_rule << 16`).

Rule semantics below verified by reading the core source
(`purerosefallen/ygopro-core`, the repo the WASM is built from):

- [x] `duel_rule: 1` reaches ocgcore for every Edison room; core stores it
      (`ocgapi.cpp:93-99`, `duel_rule = options >> 16`)
- [x] Ignition priority — with `duel_rule == 1` only, after a Normal/Flip/Special
      Summon by the turn player resolves with an empty chain, the core offers the
      turn player's monster ignition effects with priority
      (`processor.cpp:1452-1456`, literally commented "Obsolete ignition effect ruling")
- [x] First player draws on turn 1 — draw is only skipped when `duel_rule >= 3`
      (`field.cpp:1860` in `get_draw_count`, `processor.cpp:3817`)
- [x] Single face-up Field Spell — resolving a Field Spell activation under
      `duel_rule <= 2` destroys the opponent's face-up Field Spell by rule
      (`processor.cpp:4539-4545`, `destroy(..., REASON_RULE, ...)`)
- [x] No Extra Monster Zones under rule 1 — EMZ logic gated on `duel_rule >= 4`
      / `NEW_MASTER_RULE` (`field.cpp:506,651,686`)
- [x] 8000 LP, 5-card opening hand
- [x] Xyz / Pendulum / Link excluded — NOT by the engine: the core only gates
      summon types from `MASTER_RULE_2020` up (`field.cpp:849`). Enforcement is
      the whitelist pool (no such cards listed → forbidden). The lobby's
      `DUEL_MODE_MR1_FORB` is display-only
- [x] Damage Step substeps — core runs the full sequence: start
      (`MSG_DAMAGE_STEP_START` + `EVENT_BATTLE_START`, `processor.cpp:2835`),
      flip confirm (`EVENT_BATTLE_CONFIRM`, 2871), before damage calc
      (`EVENT_PRE_DAMAGE_CALCULATE`, 2904), damage calc (2961), battle damage
      (`EVENT_PRE_BATTLE_DAMAGE`, 3022), destruction, end
      (`EVENT_DAMAGE_STEP_END`, 3224-3259). Activation windows masked to
      `TIMING_DAMAGE_STEP | TIMING_DAMAGE_CAL` (1813-1814). Which card may
      activate in which window is declared per-script → covered by the §4 audit.
      Client treats the step markers as boundary-only, correctly
      (`messageClassification.ts:357-360`)
- [x] Battle Phase steps — single era-agnostic implementation (Start Step,
      Battle Step, Damage Step + damage calc, End Step; `common.h:422-426`).
      No `duel_rule` reference touches battle processing, and none is needed:
      the 2010 structure was the same; later rulebooks only codified the Damage
      Step timings. Residual era risk lives in per-card Damage Step rulings —
      covered by the script audit (§4) and the test suite scenario above
- [x] Trap Monsters occupy both a Monster Zone and a S/T Zone — core gates this
      on `duel_rule <= 4` (`operations.cpp:916,1313,1371,4660`), era-correct
- [~] Era rules the core does NOT gate by `duel_rule` (single modern
      implementation — whether it matches 2010 must be tested per rule; source:
      edisonformat.com/edison-rule-differences.html):
  - [ ] **CONFIRMED GAP** (2026-07-31): Two Attack Position 0 ATK monsters
        battling should destroy each other — the core implements MODERN behavior
        (neither destroyed), identical under duel_rule 1 and 5. Documented as
        `it.failing` in `zero-atk-battle.integration.test.ts`; fixing requires
        the core-fork escape hatch below
  - Trigger recognition mid-chain / triggers activating from outside their location
  - LP maintenance costs cannot drop a player to 0 (card self-destructs instead)
  - No responses allowed to the end-of-turn hand-size discard
  - Phase-dependent mandatory trigger effects re-activate if their ACTIVATION was negated
  - Union rule: a monster can only be equipped with 1 Union Monster at a time
- [~] **MR1 behavior test suite** against the shipped WASM (`koishipro-core.js`).
      Source reading confirms the gated semantics; the suite confirms the pinned
      binary matches the source, settles the ungated era rules above, and guards
      future version bumps. Harness: `src/test-support/ocgcore/headless-duel.ts`
      (in-process WASM, no workers, deterministic via fixed seed + PseudoShuffle).
      Scenarios:
  - [x] Ignition priority — Exiled Force vs Trap Hole (community-canonical case),
        4 tests incl. duel_rule 2 differential (`ignition-priority.integration.test.ts`)
  - [x] ACTIVATE a second Field Spell over an active one → old one destroyed with
        REASON_RULE; SETTING does NOT destroy; duel_rule 5 differential
        (`field-spell-rule.integration.test.ts`)
  - [x] Turn-1 draw happens for the starting player
        (`headless-duel.integration.test.ts`)
  - [x] 0 ATK vs 0 ATK attack-position battle → **settled: core does NOT match
        2010** (see confirmed gap above; `zero-atk-battle.integration.test.ts`)
  - [x] Damage Step per 2010 rulings (`damage-step.integration.test.ts`):
        flip effects activate in substep 6 (post-damage-calc, REASON checks);
        window masking correct — SET Rush Recklessly offered in substeps 1-3,
        SET MST masked inside the Damage Step, both live in the Battle Step;
        Honest resolution math verified (resolution-time ATK copy, exact battle
        damage). ONE script-level era gap: Honest's 2010 "during damage
        calculation" (substep 4) window is NOT implemented — the script's
        `Duel.IsDamageCalculated()` condition closes it (modern PSCT behavior);
        documented as `it.failing` → belongs to the §4 script audit
  This suite doubles as the regression guard for koishipro-core version bumps
  (currently pinned `^1.5.2`, `1.5.3` available).

Escape hatch if a core behavior is wrong for 2010: fork `purerosefallen/ygopro-core`,
compile with Emscripten, inject via `ocgcoreWasmPath` (`card-load-worker.ts:42`).
Not expected to be needed.

## 2. Banlist — TCG March 1, 2010

- [x] `evolution-assets/lflist/edison.lflist.conf` as `$whitelist`
- [x] Loaded by server with hot-reload (EDOpro-server-ts #306)
- [x] CI syntax validation on change (evolution-assets #5)
- [x] Client parses whitelist; own-code-first lookup so pre-errata codes win over alias
- [x] **Completeness audit vs edisonformat.net** (2026-07-31): all 132 entries
      (43 forbidden / 70 limited / 19 semi-limited) match our lflist by name
      and limit, zero mismatches. Reference data embedded in
      edisonformat.net/rules/banlist.js
- [ ] Optional second opinion: diff against edisonformat.com/banlist.html

## 3. Card pool — April 2010 snapshot

The community plays Edison as an **April 2010 snapshot** (FormatLibrary dates it
April 24, 2010), not the March 13-14 SJC event date. Cutoff per
edisonformat.com/legal-sets.html:

- Boosters through **Absolute Powerforce** (ABPF, Feb 16 2010)
- Side sets through **Duelist Pack: Kaiba** (DPKB, Apr 20 2010)
- Structure decks through **Machina Mayhem** (SDMM, Feb 23 2010)
- Turbo Pack 2 (TU02), WC10 game promos
- The Shining Darkness main set NOT legal. **Starlight Road**: our lflist has it
  at 3 (line 2249), matching FormatLibrary; edisonformat.com's legal-sets page
  appears to exclude it — source discrepancy, resolve during the audit

- [x] Whitelist pins the pool (unlisted card → forbidden, shown with badge)
- [x] `classic.cdb` serves deck builder (`cdbVariant: 'classic'`) and server runtime
- [ ] **Pool audit**: cross-check whitelist contents against the legal-sets list
      above, card by card (sets → passcodes → diff vs lflist)
- [ ] English-name search gap: `classic.cdb` names are Spanish only; searching
      "Ultimate Offering" finds nothing ("Ofrenda Final"). Bilingual search index
      or `.en` overlay pending (see prerelease per-language overlay pattern,
      evolution-assets #8)

## 4. Pre-errata cards — 2010 card text

Cards errata'd after March 2010 must play with their original text via a
511*-namespace copy: cdb entry + Lua script + lflist entry + image.

Present today (11):

| Code | Card | Limit |
|---|---|---|
| 511002993 | Brionac, Dragon of the Ice Barrier | 1 |
| 511002994 | Goyo Guardian | 1 |
| 511002992 | Rescue Cat | 1 |
| 511002631 | Sangan | 1 |
| 511002995 | Brain Control | 1 |
| 511002997 | Future Fusion | 1 |
| 511002980 | Treeborn Frog | 2 |
| 511003007 | Ryko, Lightsworn Hunter | 3 |
| 511002998 | Necrovalley | 3 |
| 511003028 | Darkness Approaches | 3 |
| 511000228 | Catapult Turtle | 3 |

- [x] The 11 above: cdb + script + lflist wired, deck builder renders them correctly
- [~] Card images resolve for 511* codes (spot-checked in deck builder; not audited)
- [ ] **25 missing functional erratas** — authoritative list:
      edisonformat.com/functional-errata.html names **36 cards**; we cover 11.
      Confirmed bug: **Ultimate Offering** sits in our lflist under its official
      code `80604091` (modern text) — needs a pre-errata copy. Missing:
  - Ultimate Offering, Armory Arm, Ancient Fairy Dragon, Black Garden,
    Cyber Phoenix, D.D. Survivor, Dark End Dragon, Destiny End Dragoon,
    Elemental Hero Prisma, Fortune Lady Light, Jade Knight,
    Light and Darkness Dragon, Light End Dragon, Lumina Lightsworn Summoner,
    Machina Gearframe, Mark of the Rose, Mausoleum of the Emperor,
    My Body as a Shield, Quickdraw Synchron, Red-Eyes Darkness Metal Dragon,
    Soul Exchange, Strike Ninja, Susa Soldier, Swap Frog, Urgent Tuning
  - **Priority tier** — edisonformat.net/rules/errata.json curates the 18 most
    commonly played erratas; the 9 of those we lack: Ultimate Offering,
    Elemental HERO Prisma, Light and Darkness Dragon, Machina Gearframe,
    Quickdraw Synchron, Red-Eyes Darkness Metal Dragon, Black Garden,
    Mausoleum of the Emperor, Soul Exchange. Do these first
  - Caveat: some are PSCT-interpretation differences rather than printed
    erratas — for each card decide whether the fix is a 511* copy (cdb + Lua +
    lflist + image) or whether the existing script already behaves per 2010.
    EDOPro's official pre-errata script set is the first place to borrow from
  - Discovered by the MR1 suite (2026-07-31): **Honest** (`c37742478.lua`) has
    a 2010-ruling gap — it cannot activate during damage calculation (substep
    4) because of its `Duel.IsDamageCalculated()` condition; 2010 rulings
    allowed it (removed by modern PSCT). Same class of fix as this list;
    `it.failing` in `damage-step.integration.test.ts` tracks it
- [ ] For each card needing a copy: add 511* cdb row, Lua script, lflist entry, image

## 5. Server wiring

- [x] `formatRuleMappings.edison` — rule 5, lflist by alias, `duel_rule: 1`, 450s clock
- [x] Banlist assembled into resource tree via `resources.manifest.json`
- [x] Pre-errata scripts load from `evolution-assets/card-scripts/classic` (manifest-wired)
- [ ] **Drift**: `server-formats-cdb/edison/{cards.cdb,script}/` exists on disk but is
      NOT in the manifest. It holds 3 non-511 scripts (`c25862691`, `c88264988`,
      `c89312388`) that never reach runtime. Decide: wire it in or delete it
- [ ] `511002980.lua` lacks the `c` filename prefix — verify the loader picks it up

## 6. Client UX

- [x] Edison selectable and default format (`roomCommand.ts:64`, `MR1 · 2010` label)
- [x] Deck builder: whitelist pool, limit badges, pre-errata display
- [ ] **MR1 board layout**: `board-layout.ts` is a fixed constant — Extra Monster
      Zones (monster slots 5/6) and Pendulum S/T slots always render. Hide or
      repurpose them when `duel_rule = 1`; the 2010 field is 5+5+field
- [ ] Era affordances (optional): surface the priority window in the UI so players
      understand why the turn player acts first after a summon

## 7. Matchmaking & bots

- [ ] Add `edison` to `MATCHMAKING_FORMATS` (`QueueEntry.ts:22`) + `FORMAT_ROOM_TOKEN`
- [ ] Edison bot roster in `MATCHMAKING_BOT_ROSTER` + windbot deck pool
      (era decks: Gladiator Beasts, Blackwings, Lightsworn, Quickdraw, X-Sabers…)
- [ ] Ranked Bo3 for Edison (generic Bo3 shipped in #314 — extend to the format)

---

## Suggested order

1. **Audits first** (§2, §3, §4): banlist limits, pool cutoff, errata sweep —
   data work, no engine risk, defines the real backlog size
2. **MR1 test suite** (§1): turns "believed working" into "verified", guards
   every future core bump
3. **MR1 board layout** (§6): most visible correctness gap in the client
4. **Wiring cleanup** (§5): small, removes drift risk
5. **Matchmaking + bots** (§7): new scope, reuses the July multi-format infra

## References (checked 2026-07-31)

- https://www.edisonformat.com — authoritative community reference:
  - /functional-errata.html — the 36-card pre-errata list (§4 source)
  - /legal-sets.html — pool cutoff by product category (§3 source)
  - /edison-rule-differences.html — 13 era rules vs modern (§1 source)
  - /banlist.html, /rulebook.html, /advanced-rules1.html, /rulings.html — for the audits
- https://formatlibrary.com/formats/edison — format metadata via
  /api/formats/edison (dates it April 24 2010, March 2010 banlist; drives
  online sanctioned play; includes Starlight Road — see §3 discrepancy)
- https://edisonformat.net — blocks default bot user-agents (403); accessible
  with a browser UA. Machine-readable data:
  - /rules/banlist.js — full banlist as embedded `const ban/lim/sem` arrays
    (132 entries; our lflist matched 132/132 on 2026-07-31)
  - /rules/errata.json — 18 most-played functional erratas (priority tier for §4)
  - /rules/rulebook, /rules/compendium/Substep-Triggers — damage step substep
    reference for the §1 test suite
  - /data/pdf/RULE.pdf — **Konami Official Rulebook v7.0** (2008/2009), the
    rulebook in force during Edison. PRIMARY source for era rules. Verified
    against our findings: Battle Phase = 4 steps (Start/Battle/Damage/End),
    Draw Phase with no first-turn exception, Field Spell activation destroys
    the previous one, and the "Turn Player's Priority" section (p.40-41) that
    grounds ignition priority. Konami copyright — do NOT commit the PDF to the
    repo; link this URL (local copy: ~/Downloads/RULE.pdf)
  - /community/bots — Edison bot decks, useful for §7 windbot roster
- Engine provenance: Fluorohydride → purerosefallen (_KOISHI patches) →
  libocgcore WASM → koishipro-core.js → EDOpro-server-ts
