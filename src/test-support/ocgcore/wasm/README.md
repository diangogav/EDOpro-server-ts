# Edison core fork WASM

`libocgcore-edison-fork.wasm` is a patched build of the ocgcore engine used by
the Edison pre-errata behavior tests (and eventually by Edison production
rooms). It carries FOUR features. One is an additive effect code; the other
three are game-rule restorations gated by `duel_rule <= 1` (MR1/Edison) so
modern duels (`duel_rule >= 2`) are bit-for-bit untouched.

## Features

### 1. `EFFECT_EXTRA_RELEASE_OPT` (10159) — Soul Exchange pre-errata (additive)

The affected opponent card joins the NORMAL release pool — optional, multiple
allowed, valid for tribute summon, non-summon release and ritual material. The
stock core's plain `EFFECT_EXTRA_RELEASE` forces the tribute (modern Soul
Exchange errata), and its `_SUM`/`_NONSUM` variants are one-of-only, so no stock
primitive can express the 2010 "you can Tribute that monster" text. Additive:
cards using the existing effect codes behave identically (guarded by
`soul-exchange.integration.test.ts`).

### 2. Union: 1 Union Monster per monster — Edison rule #3 (`duel_rule <= 1`)

2010 text: ALL union monsters carry "A monster can only be equipped with 1
Union Monster at a time." Modern lets multiple modern unions stack. The shared
Lua `Auxiliary.CheckUnionEquip` / `UnionEquipFilter`
(`resources/.../base/script/utility.lua`) decide equip-ability from
`tc:GetUnionCount()`, which returns `(modern_count, old_count)`.

Fix (C++, `card::get_union_count` + `card::get_old_union_count`): when
`duel_rule <= 1`, BOTH accessors report the TOTAL equipped union-status count
(fold every `EFFECT_UNION_STATUS` and `EFFECT_OLDUNION_STATUS` equip together).
That makes both Lua branches (`old_count==0` / `modern_count==0`) and the C++
`card_check_equip_target` / `card_check_union_target` checks require zero unions
already equipped, so a 2nd union of ANY kind is blocked on a monster that
already holds one — for every ~44 union card, with zero Lua/script edits.

### 3. 0 ATK mutual destruction — Edison rule #13 (`duel_rule <= 1`)

2010: two Attack-Position monsters with 0 ATK destroy each other in battle.
Sub-rule kept intact (both cores): a 0-ATK attack-position attacker does NOT
destroy a 0-DEF defense-position monster. The stock core's
`field::calculate_battle_damage` guards the equal-ATK mutual-destruction path
with `if(attacker_value != 0)`, so two 0-ATK attackers destroy NEITHER (modern).

Fix (C++, `processor.cpp` `field::calculate_battle_damage`): the guard becomes
`if(attacker_value != 0 || core.duel_rule <= 1)`. That branch is
Attack-vs-Attack only (inside `if(attack_target->is_position(POS_ATTACK))`);
the 0-ATK-vs-0-DEF sub-rule lives in the sibling defense branch and is
untouched.

### 4. LP cost cannot reduce LP to 0 — Edison rule #10 (`duel_rule <= 1`)

2010: you cannot pay an LP COST that would bring you to exactly 0 (or below);
the effect is not activatable. Modern (stock core) allows paying to exactly 0
(e.g. My Body as a Shield, cost 1500, activatable at 1500 LP). A mandatory
"pay or destroy" maintenance cost self-destructs the card instead of paying to
0 — the existing scripts already self-destruct when `CheckLPCost` returns false,
so refusing the payment here yields the era self-destruct automatically.

Fix (C++, `field.cpp` `field::check_lp_cost`): the final payability check
`if(val <= player[playerid].lp)` is replaced, when `duel_rule <= 1`, by the
strict `if(val < player[playerid].lp)`. Both the can-activate check
(`must_pay == 0`) and actual payment flow through this method.

## Provenance

- Source: `purerosefallen/ygopro-core` @ `973672d` (master), the repo the
  vendored `koishipro-core.js` WASM is built from.
- Patch: `edison-core-fork.patch` (this directory) — 4 files, 4 features:
  - `effect.h` — `#define EFFECT_EXTRA_RELEASE_OPT 10159`.
  - `field.cpp` — `get_release_list`, `get_summon_release_list`,
    `get_ritual_material` (Soul Exchange, 3 sites) + `check_lp_cost` (feature 4).
  - `card.cpp` — `get_union_count`, `get_old_union_count` (feature 2).
  - `processor.cpp` — `calculate_battle_damage` (feature 3).

## Reproducing the build

```bash
git clone --depth 5 --branch master https://github.com/purerosefallen/ygopro-core core
cd core
git checkout 973672d
git apply /path/to/edison-core-fork.patch

# deps: Lua 5.4.8 + repo premake config, premake5 5.0.0-beta8
wget -O - https://www.lua.org/ftp/lua-5.4.8.tar.gz | tar zfx -
mv lua-5.4.8 lua && cp premake/lua.lua lua/premake5.lua && ln -sf premake/dll.lua .

# premake5 gmake runs on the HOST (the beta8 binary needs a newer glibc than
# emsdk:3.1.7 ships). `make` runs inside the container for an ABI-compatible
# binary. If your host glibc is too old, run premake5 in any modern container.
premake5 gmake --file=dll.lua --os=emscripten

# Emscripten 3.1.1–3.1.7 required (per upstream README); 3.1.7 keeps the
# binary ABI-compatible with the vendored JS glue in koishipro-core.js 1.5.2,
# so only the .wasm needs swapping (wrapper option `wasmBinary`).
docker run --rm -v "$PWD":/src -w /src/build emscripten/emsdk:3.1.7 \
  bash -c 'emmake make config=release_wasm_cjs -j"$(nproc)"'

sha256sum build/bin/wasm_cjs/Release/libocgcore.wasm
# 4272eb0d077702fea3e9fb1e5255653a99079ec82e06d45448aa438c6a302f23
```

The build is deterministic: rebuilding from the same commit + patch yields a
bit-identical binary.

## Using it

- Tests: `HeadlessDuel.create({ wasmPath })` per duel, or `OCGCORE_WASM=<path>`
  to run the whole ocgcore suite against it (regression guard: all suites must
  stay green on both stock and fork binaries). The differential tests
  (`soul-exchange`, `union-limit`, `zero-atk-battle`, `lp-cost-limit`,
  `machina-gearframe`) pin each core per-duel (`wasmPath: FORK_WASM` vs
  `wasmPath: ""`) and assert that core's real behavior, so they pass regardless
  of `OCGCORE_WASM`.
- Server (ygopro path — the one Edison rooms use): drop this binary as a file
  named `ocgcore-worker` at the server cwd. `YGOProResourceLoader` resolves
  that path, `CardLoadWorker` embeds it into the shared `CardStorage`, and
  `OcgcoreWorker` boots the wrapper with it (`card-load-worker.ts:96`,
  `ocgcore-worker.ts:117`). Missing file falls back SILENTLY to the vendored
  WASM — verify via the card-storage hash. The three `duel_rule <= 1` gates
  make the new behavior Edison-only; modern rooms (`duel_rule >= 2`) are
  untouched. CoreIntegrator (`src/edopro/`) is the native-core EDOPro path and
  is NOT involved.
```
sha256: 4272eb0d077702fea3e9fb1e5255653a99079ec82e06d45448aa438c6a302f23
```
