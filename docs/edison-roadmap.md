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
  - [x] **RESOLVED via fork** (2026-08-03): Two Attack Position 0 ATK monsters
        battling now destroy each other. Was MODERN (neither destroyed);
        `field::calculate_battle_damage` guarded mutual destruction with
        `if(attacker_value != 0)` → gated to `|| core.duel_rule <= 1`. The
        0-ATK-vs-0-DEF sub-rule (sibling defense branch) is untouched.
        `zero-atk-battle.integration.test.ts` now a core-differential test
        (2010 on fork, modern on stock, duelRule-5 guard proves the gate)
  - [x] **RESOLVED at script level** (2026-08-01, initially misdiagnosed as a
        core gap): mid-chain `Duel.Summon` is deferred by the core to after the
        chain ends (libduel.cpp `core.summon_reserved` — modern "immediately
        after this effect resolves" semantics), where the summon-negation
        window opens. Summon proc case 12 skips that window when the summoned
        card has `EFFECT_CANNOT_DISABLE_SUMMON` — registering it FIELD-type +
        `IGNORE_RANGE+SET_AVAILABLE` scoped to the card (s.summon2010 in
        `c511003023.lua`) enforces the 2010 UO ruling: Solemn gets NO window.
        (The first experiment used a SINGLE-type effect with RESETS_STANDARD,
        which dies when the card hits the field — hence the false "not fixable
        in Lua".) Same recipe applies to Mausoleum of the Emperor. Verified by
        `ultimate-offering.integration.test.ts` (now a passing test)
  - Trigger recognition mid-chain / triggers activating from outside their location
    (verified partial: `ladd-activation-offers.integration.test.ts`)
  - [x] **RESOLVED via fork** (2026-08-03): LP costs cannot drop a player to 0.
        `field::check_lp_cost` strict `val < lp` under `duel_rule <= 1` (was `<=`)
        → cost reaching exactly 0 is unpayable; mandatory pay-or-destroy scripts
        self-destruct automatically. `lp-cost-limit.integration.test.ts` (diff)
  - [x] **VERIFIED** (2026-08-03): No responses allowed to the end-of-turn
        hand-size discard — core opens no chain window (`end-phase-discard.integration.test.ts`)
  - Phase-dependent mandatory trigger effects re-activate if their ACTIVATION was negated
    (covered by the LADD tests)
  - [x] **RESOLVED via fork** (2026-08-03): Union rule — a monster can only be
        equipped with 1 Union Monster at a time. The core enforces NOTHING under
        any duel_rule (limit was pure script-side, only Gearframe fixed). Fixed
        centrally in `card::get_union_count`/`get_old_union_count`: under
        `duel_rule <= 1` both fold modern+old into the total, so the shared Lua
        `Auxiliary` equip filter (`old_count==0`) blocks a 2nd union on any
        monster — ZERO per-card edits, covers all ~44 union cards.
        `union-limit.integration.test.ts` (3-way differential). Sub-rule "only 6
        unions keep the destroy-substitute protection" is per-card text — separate audit
  - **VERIFIED** (2026-08-03): SEGOC ordering (TP-mandatory before NTP-mandatory)
    matches 2010 — `segoc.integration.test.ts`
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
        damage). Honest's 2010 "during damage calculation" window: RESOLVED
        (2026-08-01) via the pre-errata copy 910003001 (formats/edison pool).
        Assertions pin the observable signature: 6 pre-MSG_BATTLE chain windows
        always; pre-errata offered in 3 (incl. the damage-cal window, the last
        one), official in 2 and never in the last. Confirmed end-to-end in live
        duels (both Honest-war regimes, winner inversion)
  This suite doubles as the regression guard for koishipro-core version bumps
  (currently pinned `^1.5.2`, `1.5.3` available).

Escape hatch if a core behavior is wrong for 2010: fork `purerosefallen/ygopro-core`,
compile with Emscripten, inject via `ocgcoreWasmPath` (`card-load-worker.ts:42`).

**ACTIVATED 2026-08-02** for Soul Exchange (optional tribute has no stock
primitive): additive `EFFECT_EXTRA_RELEASE_OPT` (10159) patch. Reproducible
build (bit-identical): `src/test-support/ocgcore/wasm/` — patch file, README
with the full recipe (upstream @973672d + Lua 5.4.8 + premake5 beta8 +
emsdk 3.1.7 docker, config=release_wasm_cjs), and the built
`libocgcore-edison-fork.wasm` (ABI-compatible with the vendored glue; only the
.wasm swaps). Tests run against it via `HeadlessDuel` `wasmPath` /
`OCGCORE_WASM` env; the full ocgcore suite must stay green on BOTH binaries.

**EXTENDED 2026-08-03** — three more `duel_rule <= 1`-gated patches added in one
rebuild (new sha256 `4272eb0d077702fea3e9fb1e5255653a99079ec82e06d45448aa438c6a302f23`,
still reproducible): #13 0-ATK mutual destruction (`processor.cpp
calculate_battle_damage`), #10 LP-cost-to-0 refusal (`field.cpp check_lp_cost`),
#3 Union 1-per-monster (`card.cpp get_union_count`/`get_old_union_count`). Each
is a modern-safe gate (proven by full-suite green on both binaries + explicit
duelRule-5 guards in the differential tests). The patch now holds 4 features.
PENDING: durable fork repo home; production rooms still run the stock WASM
(wire `ocgcoreWasmPath` for Edison rooms when smoke-tested).

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
- The Shining Darkness main set NOT legal. **Starlight Road**: RESOLVED
  (2026-08-01) — LEGAL. First TCG print is Duelist Pack: Yusei 3
  (DP10-EN025, Mar 5 2010), same side-set category as DPKB and pre-cutoff.
  Our lflist (3) and FormatLibrary are correct

- [x] Whitelist pins the pool (unlisted card → forbidden, shown with badge)
- [x] `classic.cdb` serves deck builder (`cdbVariant: 'classic'`) and server runtime
- [x] **Pool audit** (2026-08-01): 3672 whitelist entries vs YGOPRODeck
      tcg_date ≤ 2010-04-24, both directions. Zero violations: 4 apparent
      late-date entries are all YGOPRODeck reprint-date errors on JUMP promos
      (Exodius, Darkness Neosphere, Orichalcos Shunoros, Genesis Dragon — all
      promo-printed pre-cutoff); 27 "missing" cards are all Duel Terminal 1,
      correctly excluded (DT01/GLD3 not in edisonformat.com legal sets). All
      whitelist codes exist in classic.cdb. 25 entries use OCG alt passcodes,
      all resolve correctly
- [ ] English-name search gap: `classic.cdb` names are Spanish only; searching
      "Ultimate Offering" finds nothing ("Ofrenda Final"). Bilingual search index
      or `.en` overlay pending (see prerelease per-language overlay pattern,
      evolution-assets #8)

## 4. Pre-errata cards — 2010 card text

Cards errata'd after March 2010 must play with their original text. TWO
patterns exist:

- **Legacy**: 511* copies inside the classic pool (the 11 below)
- **Current** (2026-08-01): dedicated `formats/edison` pool
  (`edison-pre-errata.cdb` + own script dir). Code allocation: borrow EDOPro's
  exact 511* code when their pre-errata exists; otherwise our own 910003001+
  range. Per-card status, workflow and review log: **`docs/edison-erratas.md`**
  (source of truth for this section)

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
- [ ] **22 missing functional erratas** (audited 2026-08-01; was 25 — 3 are
      already wired outside the 511* pattern: Ancient Fairy Dragon `25862691`,
      Red-Eyes Darkness Metal Dragon `88264988` (both alias-mapped copies, done)
      and Elemental HERO Prisma `89312388` — but Prisma's classic script is
      DEAD at runtime, see §5 precedence bug. Authoritative list:
      edisonformat.com/functional-errata.html names **36 cards**; we cover 13
      (11 legacy 511* + Honest `910003001` ✅ + Ultimate Offering `511003023` 🧪).
      **Ultimate Offering: WIRED** (2026-08-01) as `511003023` (EDOPro borrow,
      ported to the classic WASM API), 🧪 ENGINE-OK, smoke pending; the 2010
      Solemn ruling is fully enforced at script level (see §1). For the rest of the backlog
      almost no EDOPro pre-errata scripts exist — most must be written. Missing:
  - Armory Arm, Ancient Fairy Dragon, Black Garden,
    Cyber Phoenix, D.D. Survivor, Dark End Dragon, Destiny End Dragoon,
    Elemental Hero Prisma, Fortune Lady Light, Jade Knight,
    Light and Darkness Dragon, Light End Dragon, Lumina Lightsworn Summoner,
    Machina Gearframe, Mark of the Rose, Mausoleum of the Emperor,
    My Body as a Shield, Quickdraw Synchron, Red-Eyes Darkness Metal Dragon,
    Soul Exchange, Strike Ninja, Susa Soldier, Swap Frog, Urgent Tuning
  - **Priority tier** — edisonformat.net/rules/errata.json curates the 18 most
    commonly played erratas; the 7 of those we still lack (UO wired, REDMD done):
    Elemental HERO Prisma, Light and Darkness Dragon, Machina Gearframe,
    Quickdraw Synchron, Black Garden, Mausoleum of the Emperor, Soul Exchange.
    Do these first
  - Caveat: some are PSCT-interpretation differences rather than printed
    erratas — for each card decide whether the fix is a 511* copy (cdb + Lua +
    lflist + image) or whether the existing script already behaves per 2010.
    EDOPro's official pre-errata script set is the first place to borrow from
  - **Honest: ✅ DONE** (2026-08-01) as `910003001` in the formats/edison pool —
    the first card through the full new workflow: 2010 ruling source-verified
    (UDE verbatim: substeps 1, 3 AND 4; the damage-cal restriction is a
    2014-03-21 OCG RULING change, not a text errata), engine tests pin the
    3-vs-2 window signature, manual smoke verified both Honest-war regimes in
    live duels. Base `c37742478.lua` reverted to pristine modern behavior
- [ ] For each card needing a copy: add 511* cdb row, Lua script, lflist entry, image

## 5. Server wiring

- [x] `formatRuleMappings.edison` — rule 5, lflist by alias, `duel_rule: 1`, 450s clock
- [x] Banlist assembled into resource tree via `resources.manifest.json`
- [x] Pre-errata scripts load from `evolution-assets/card-scripts/classic` (manifest-wired)
- [ ] **CRITICAL — script precedence bug** (found 2026-08-01 during the Honest
      fix): `DirScriptReaderEx` is first-match-wins and both the test harness
      and production resolve `[base, classic, formats/…]` — **base always wins**.
      Any classic script that shares a filename with a base script is dead code
      (confirmed: `c89312388.lua` Prisma override never loads). 511* scripts are
      unaffected (unique names). MITIGATED (2026-08-01): the formats/edison pool
      pattern sidesteps this entirely — pre-errata copies use unique codes
      (511*/910*) so base can never shadow them, and the Honest base-script edit
      was reverted (the fix now lives in `c910003001.lua`). Decision remains
      only for the legacy same-name overrides (Prisma, Soul Exchange): migrate
      them to the formats/edison pattern (preferred) rather than flipping
      precedence
- [ ] **Drift**: `server-formats-cdb/edison/{cards.cdb,script}/` exists on disk but is
      NOT in the manifest. It holds 3 non-511 scripts (`c25862691`, `c88264988`,
      `c89312388`) that never reach runtime. Decide: wire it in or delete it
- [ ] **Treeborn Frog `511002980` has TWO bugs** (audited 2026-08-01): filename
      lacks the `c` prefix (`511002980.lua` in every location; all other copies
      are `c511*.lua`) AND its cdb row has `alias = 0` instead of `12538374` —
      the loader almost certainly never picks it up. Fix both together

## 6. Client UX

- [x] Edison selectable and default format (`roomCommand.ts:64`, `MR1 · 2010` label)
- [x] Deck builder: whitelist pool, limit badges, pre-errata display
- [x] Edison deck builder loads the pre-errata pool (2026-08-01): new
      CdbVariant `edison` composes `cdb:classic` + `cdb:edison-pre-errata`
      (overlay wins). Both the new cdb resource AND the edison lflist are
      pinned to the evolution-assets `edison-pre-errata` branch via
      `EDISON_PRE_ERRATA_REF` — flip back to `main` after that branch merges
- [ ] CDN art aliases for custom pre-errata codes: `CUSTOM_ART_ALIASES` map in
      evolution-card-cdn (`910003001`→Honest, `910003002`→Black Garden,
      `25862691`→AFD art, fixing a pre-existing 404) — implemented, **pending
      `wrangler deploy`**
- [ ] **TOKEN GAP — live prod bug** (found 2026-08-02 during the Black Garden
      smoke): `classic.cdb`, `jtp.en.cdb` and `jtp.es.cdb` contain ZERO token
      entries (base has 258), and the client composes per-format cdbs WITHOUT
      base — so EVERY token (Sheep, Fluff, Rose…) shows an empty hover/preview
      in Edison and JTP duels, in prod, since forever. Server unaffected (its
      pool includes base). Fix ready to apply ON MAIN of evolution-assets
      (additive, deck-builder-invisible): copy the 258 token rows from base.es
      into classic.cdb, and from base.en/base.es into jtp.en/jtp.es. Main CI
      regenerates .gz + version-manifest → prod clients pick it up via
      manifest freshness (works, unlike branch-ref resources)
- [x] Damage-step smoke tooling: `DUEL_DEBUG_DS_WINDOWS=1` traces every chain
      window (player, candidates, damage-cal boundary) from
      `YGOProDuelingState.registerDamageStepWindowTrace`
- [ ] **MR1 board layout**: `board-layout.ts` is a fixed constant — Extra Monster
      Zones (monster slots 5/6) and Pendulum S/T slots always render. Hide or
      repurpose them when `duel_rule = 1`; the 2010 field is 5+5+field
- [ ] Era affordances (optional): surface the priority window in the UI so players
      understand why the turn player acts first after a summon. Era-UX note from
      the Honest smoke (2026-08-01): the substep-1 damage-step chain window ships
      `specialCount=0` from the core, so default smart-chain auto-declines it —
      faithful to era ygopro (chain-always surfaces it); document, don't "fix"

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

## Ruleset target: pre-UTW (era-authentic 2010)

UTW = "Ultimate Time Wizard", Konami's official Edison tournament series
(YCS/WCQ side events replaying April 2010). It split the community's rulings
into two schools: **pre-UTW** (edisonformat.com — the historical UDE/Konami
rulings as actually applied in 2010) and **post-UTW** (edisonformat.net —
modern Konami policy + "Edison-accurate PSCT" applied to the 2010 pool at
official events; by judges Mika & eva). edisonrul.ing aggregates both;
tournament convention prefers .net on conflict.

THIS PROJECT TARGETS PRE-UTW (era-authentic), per the goal at the top of this
file — e.g. Honest's damage-calculation window (910003001) is pre-UTW-only
behavior; a post-UTW event would deny it. The functional-errata card list
(both schools share it) remains the prioritization source. When a card's two
schools diverge, implement pre-UTW and note the divergence in
docs/edison-erratas.md.

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
