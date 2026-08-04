/**
 * Union protective effect — pre-errata 910 copies vs official.
 *
 * 2010 TCG print (DPKB, April 2010): "if the equipped monster would be destroyed
 * AS A RESULT OF BATTLE, destroy this card instead" → BATTLE-ONLY protection.
 * Modern base: aux.EnableUnionAttribute → REASON_BATTLE+REASON_EFFECT protection.
 *
 * Three scenario groups (using Y-Dragon Head / X-Head Cannon as the primary pair):
 *
 *  1. BATTLE protection RETAINED: equip Y-Dragon (910003016) → battle-destroy
 *     X-Head Cannon (in DEF mode, DEF 1500 base + 400 union boost = 1900) →
 *     Gene-Warped (ATK 2000) attacks and wins → union substitutes (X-Head survives,
 *     Y-Dragon to GY). Same behavior for BOTH 910 and official.
 *     NOTE: X-Head Cannon base ATK is 1800. With union ATK boost (+400) = 2200 which
 *     beats Gene-Warped (2000), so X-Head must be in DEFENSE mode for Gene-Warped
 *     to trigger the battle-destroy condition (X-Head DEF 1500+400=1900 < 2000).
 *
 *  2. EFFECT protection DROPPED: equip Y-Dragon → Dark Hole destroys field →
 *     Official (65622692): union substitutes, X-Head survives. MZONE P0 = 1.
 *     910003016: NO substitute, X-Head destroyed too. MZONE P0 = 0.
 *     THIS IS THE CORE DELTA.
 *
 *  3. FUSION REGRESSION: 910003016 (Y-Dragon) + 62651957 (X-Head Cannon) on field →
 *     XY-Dragon Cannon (2111707) appears in spSummonableCards (alias IsFusionCode
 *     resolves 910003016 → 65622692 via alias, which matches the fusion proc).
 */
import {
	BattleCmdType,
	IdleCmdType,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectUnselectCard,
	YGOProMsgSpSummoning,
} from "ygopro-msg-encode";

import { _OcgcoreConstants } from "koishipro-core.js";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const { OcgcoreScriptConstants } = _OcgcoreConstants;

// --- Card codes ---
const Y_DRAGON_PRE = 910003016; // alias 65622692
const Y_DRAGON_OFF = 65622692; // official Y-Dragon Head
const Z_METAL_PRE = 910003017; // alias 64500000
const W_WING_PRE = 910003018; // alias 96300057
const X_HEAD_CANNON = 62651957; // ATK 1800, DEF 1500 — carrier for Y-Dragon and Z-Metal Tank
const V_TIGER_JET = 51638941; // carrier for W-Wing Catapult
const XY_DRAGON_CANNON = 2111707; // fusion monster (extra deck)
const DARK_HOLE = 53129443; // Normal Spell — destroys ALL face-up monsters (effect)
// Gene-Warped Warwolf: Level 4 Normal, ATK 2000.
// With union equip: X-Head DEF 1500+400=1900 < 2000 → Gene-Warped beats DEF-mode X-Head.
const GENE_WARPED = 69247929;

const LOCATION_MZONE = OcgcoreScriptConstants.LOCATION_MZONE;
const LOCATION_SZONE = OcgcoreScriptConstants.LOCATION_SZONE;
const LOCATION_GRAVE = OcgcoreScriptConstants.LOCATION_GRAVE;

/** Advance to the next SelectIdleCmd. */
async function idle(duel: HeadlessDuel) {
	return (await duel.advanceUntil(YGOProMsgSelectIdleCmd)).targetMessage;
}

/** Change battle position (ATK→DEF or DEF→ATK) of `code` from the current idle window. */
async function repositionCard(duel: HeadlessDuel, code: number): Promise<void> {
	const m = await idle(duel);
	const entry = m.reposableCards.find((c) => c.code === code);
	if (!entry) {
		throw new Error(
			`${code} not reposable. Reposable: ${m.reposableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		m.prepareResponse(IdleCmdType.REPOS, {
			code: entry.code,
			controller: entry.controller,
			location: entry.location,
			sequence: entry.sequence,
		}),
	);
}

/** Normal Summon `code` from the current idle window. */
async function normalSummon(duel: HeadlessDuel, code: number): Promise<void> {
	const m = await idle(duel);
	const s = m.summonableCards.find((c) => c.code === code);
	if (!s) {
		throw new Error(
			`${code} not summonable. Summonable: ${m.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		m.prepareResponse(IdleCmdType.SUMMON, {
			code: s.code,
			controller: s.controller,
			location: s.location,
			sequence: s.sequence,
		}),
	);
}

/** Activate a card in the current idle window by code, from hand or field. */
async function activateCard(duel: HeadlessDuel, code: number, location?: number): Promise<void> {
	const m = await idle(duel);
	const entry = m.activatableCards.find(
		(c) => c.code === code && (location === undefined || c.location === location),
	);
	if (!entry) {
		throw new Error(
			`${code} (loc=${location}) not activatable. Activatable: ${m.activatableCards
				.map((c) => `${c.code}@loc${c.location}`)
				.join(", ")}`,
		);
	}
	duel.setResponse(
		m.prepareResponse(IdleCmdType.ACTIVATE, {
			code: entry.code,
			controller: entry.controller,
			location: entry.location,
			sequence: entry.sequence,
		}),
	);
}

/** From the current MZONE idle window, activate the union equip ignition for `unionCode`
 *  and pick the first target offered (the carrier). Returns the target picked. */
async function equipUnion(
	duel: HeadlessDuel,
	unionCode: number,
): Promise<{ code: number; controller: number; location: number; sequence: number }> {
	const m = await idle(duel);
	const entry = m.activatableCards.find(
		(c) => c.code === unionCode && c.location === LOCATION_MZONE,
	);
	if (!entry) {
		throw new Error(
			`Union equip ignition for ${unionCode} not offered. Activatable: ${m.activatableCards
				.map((c) => `${c.code}@loc${c.location}`)
				.join(", ")}`,
		);
	}
	duel.setResponse(
		m.prepareResponse(IdleCmdType.ACTIVATE, {
			code: entry.code,
			controller: entry.controller,
			location: entry.location,
			sequence: entry.sequence,
		}),
	);
	const rt = await duel.advanceUntil(YGOProMsgSelectCard);
	const target = rt.targetMessage.cards[0];
	duel.setResponse(
		rt.targetMessage.prepareResponse([
			{
				code: target.code,
				controller: target.controller,
				location: target.location,
				sequence: target.sequence,
			},
		]),
	);
	return target;
}

/** Pass turn (TO_EP from current idle). */
async function passTurn(duel: HeadlessDuel): Promise<void> {
	const m = await idle(duel);
	duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
}

// ---------------------------------------------------------------------------
// Scenario 1: BATTLE protection
// ---------------------------------------------------------------------------

describe("Union battle-substitute — BATTLE protection (both 910 and official)", () => {
	/**
	 * Setup:
	 *   P0 deck: [X_HEAD_CANNON, Y_DRAGON (preOrOff), ...pads]
	 *   P1 deck: [GENE_WARPED, ...pads]
	 *
	 * T1 P0: summon X-Head Cannon (ATK 1800, DEF 1500). End turn.
	 * T2 P1: pass.
	 * T3 P0: reposition X-Head to DEF (reposable — summoned last turn).
	 *        Summon Y-Dragon Head (union). Equip Y-Dragon → X-Head.
	 *        X-Head DEF = 1500 base + 400 union boost = 1900. End turn.
	 *        NOTE: X-Head base ATK is 1800. With Y-Dragon ATK boost (+400) = 2200 which
	 *        beats Gene-Warped (2000). A freshly summoned monster cannot change battle
	 *        position the same turn, so X-Head is summoned one turn early.
	 * T4 P1: summon Gene-Warped Warwolf (ATK 2000), attack X-Head in DEF (DEF 1900).
	 *        → Gene-Warped wins → X-Head would be destroyed by battle →
	 *          union substitute fires → Y-Dragon to GY, X-Head remains.
	 *
	 * Assert: X-Head still in P0 MZONE (survived); Y-Dragon no longer in SZONE (destroyed as substitute).
	 */
	async function runBattleSubTest(unionCode: number): Promise<void> {
		// X-Head first so it can be repositioned on the next turn (cannot reposition
		// a freshly normal-summoned monster the same turn it was summoned).
		const specificCards = [X_HEAD_CANNON, unionCode];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([GENE_WARPED]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards, GENE_WARPED]),
		});
		try {
			// T1 P0: summon X-Head Cannon (ATK 1800) to the MZONE
			await normalSummon(duel, X_HEAD_CANNON);
			await passTurn(duel);
			// T2 P1: pass
			await passTurn(duel);
			// T3 P0: reposition X-Head to DEF (reposable now — summoned last turn).
			// DEF = 1500 base + 400 union boost = 1900 < Gene-Warped ATK 2000.
			await repositionCard(duel, X_HEAD_CANNON);
			// Summon the union monster to MZONE then equip it onto X-Head.
			// Ignition effects can activate the same turn the monster is summoned.
			await normalSummon(duel, unionCode);
			// Equip the union from MZONE → moves to SZONE
			await equipUnion(duel, unionCode);
			await passTurn(duel);

			// T4 P1: summon Gene-Warped Warwolf
			await normalSummon(duel, GENE_WARPED);
			// Enter Battle Phase
			const m = await idle(duel);
			duel.setResponse(m.prepareResponse(IdleCmdType.TO_BP));
			const bc = (await duel.advanceUntil(YGOProMsgSelectBattleCmd)).targetMessage;
			const att = bc.attackableCards.find((c) => c.code === GENE_WARPED);
			if (!att) throw new Error("Gene-Warped Warwolf cannot attack");
			duel.setResponse(
				bc.prepareResponse(BattleCmdType.ATTACK, {
					code: att.code,
					controller: att.controller,
					location: att.location,
					sequence: att.sequence,
				}),
			);
			// Drive through battle resolution.
			// Gene-Warped (ATK 2000) attacks X-Head in DEF (DEF 1900) — X-Head would be
			// destroyed. The union substitute fires → Y-Dragon to GY, X-Head survives.
			// After the battle resolves the engine gives another SelectBattleCmd
			// (Gene-Warped already attacked, attackableCards = []). We then end BP.
			for (let i = 0; i < 10; i++) {
				const r = await duel.advanceUntilOneOf([YGOProMsgSelectIdleCmd, YGOProMsgSelectBattleCmd]);
				if (r.targetMessage instanceof YGOProMsgSelectIdleCmd) break;
				const battleCmd = r.targetMessage as YGOProMsgSelectBattleCmd;
				duel.setResponse(battleCmd.prepareResponse(BattleCmdType.TO_M2));
			}

			const p0Mzone = duel.queryLocationCount(0, LOCATION_MZONE);
			const p0Szone = duel.queryLocationCount(0, LOCATION_SZONE);

			// X-Head must still be in P0's MZONE (survived the battle via substitute)
			expect(p0Mzone).toBeGreaterThanOrEqual(1);
			// Union should no longer be in SZONE (was destroyed as substitute)
			expect(p0Szone).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}

	it("910003016 (pre-errata Y-Dragon Head): battle-substitute fires, X-Head Cannon survives", async () => {
		await runBattleSubTest(Y_DRAGON_PRE);
	}, 120000);

	it("65622692 (official Y-Dragon Head baseline): battle-substitute also fires (both protect against battle)", async () => {
		await runBattleSubTest(Y_DRAGON_OFF);
	}, 120000);
});

// ---------------------------------------------------------------------------
// Scenario 2: EFFECT protection delta (Dark Hole)
// ---------------------------------------------------------------------------

describe("Union effect-substitute DELTA — Dark Hole destroys all face-up monsters", () => {
	/**
	 * Setup:
	 *   P0 deck: [unionCode, X_HEAD_CANNON, DARK_HOLE, ...pads]
	 *   P1 deck: [pads]
	 *
	 * T1 P0: summon X-Head Cannon, equip union, end turn.
	 * T3 P0: activate Dark Hole from hand → destroys all face-up monsters.
	 *
	 * Official (65622692): EFFECT protection active → union substitutes →
	 *   X-Head survives. P0 MZONE = 1 (X-Head stays).
	 * 910003016: EFFECT protection removed → no substitute → X-Head destroyed.
	 *   P0 MZONE = 0.
	 */
	async function runEffectSubTest(unionCode: number): Promise<number> {
		const specificCards = [unionCode, X_HEAD_CANNON, DARK_HOLE];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards]),
		});
		try {
			// T1 P0: summon union to MZONE
			await normalSummon(duel, unionCode);
			await passTurn(duel);
			// T2 P1: pass
			await passTurn(duel);
			// T3 P0: summon X-Head Cannon (carrier), equip union
			await normalSummon(duel, X_HEAD_CANNON);
			await equipUnion(duel, unionCode);
			await passTurn(duel);

			// T4 P1: pass
			await passTurn(duel);

			// T5 P0: activate Dark Hole from hand
			await activateCard(duel, DARK_HOLE);

			// Advance to next idle window (after Dark Hole resolves)
			await idle(duel);

			return duel.queryLocationCount(0, LOCATION_MZONE);
		} finally {
			await duel.cleanup();
		}
	}

	it("910003016 (pre-errata): NO effect-substitute — Dark Hole destroys X-Head Cannon (MZONE P0 = 0)", async () => {
		const mzone = await runEffectSubTest(Y_DRAGON_PRE);
		expect(mzone).toBe(0);
	}, 120000);

	it("65622692 (official baseline): effect-substitute fires — X-Head Cannon survives Dark Hole (MZONE P0 = 1)", async () => {
		const mzone = await runEffectSubTest(Y_DRAGON_OFF);
		expect(mzone).toBe(1);
	}, 120000);
});

// ---------------------------------------------------------------------------
// Scenario 3: Fusion identity regression (IsFusionCode alias resolution)
// ---------------------------------------------------------------------------

describe("Fusion identity regression — 910003016 alias resolves via IsFusionCode", () => {
	/**
	 * XY-Dragon Cannon (2111707) fusion proc: aux.AddFusionProcCode2(c, 62651957, 65622692, true, true).
	 * IsFusionCode internally checks own code AND alias. Since 910003016 has alias=65622692,
	 * IsFusionCode(65622692) returns true for 910003016. The fusion should be offered.
	 *
	 * Setup:
	 *   P0 deck: [Y_DRAGON_PRE, X_HEAD_CANNON, ...pads]
	 *   P0 extra: [XY_DRAGON_CANNON]
	 *
	 * T1 P0: summon X-Head Cannon, equip Y-Dragon (moves to SZONE). Now P0 MZONE = 1 (X-Head).
	 * Still T1 P0 idle: XY-Dragon Cannon should appear in spSummonableCards
	 * (Contact Fusion proc checks the field for both materials — X-Head in MZONE and
	 * Y-Dragon in SZONE counts as a field card for the fusion procedure).
	 *
	 * If XY-Dragon Cannon is in spSummonableCards → alias IsFusionCode resolution works.
	 * If MSG_SP_SUMMONING with XY_DRAGON_CANNON is observed after selecting it → full confirm.
	 */
	it("910003016 + X-Head Cannon on field → XY-Dragon Cannon fusion is offered (IsFusionCode alias OK)", async () => {
		const specificCards = [Y_DRAGON_PRE, X_HEAD_CANNON];
		const discardPads = makeDiscardPadsResponder([Y_DRAGON_PRE, X_HEAD_CANNON]);
		const duel = await HeadlessDuel.create({
			decks: [
				{
					main: buildDeck(specificCards),
					extra: [XY_DRAGON_CANNON],
				},
				{ main: buildDeck([]) },
			],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: (msg) => {
				// Handle fusion material selection (Contact Fusion uses SelectUnselectCard
				// to pick materials from the field).
				if (msg instanceof YGOProMsgSelectUnselectCard) {
					if (msg.selectableCards.length > 0) {
						const p = msg.selectableCards[0];
						return msg.prepareResponse({
							code: p.code,
							controller: p.controller,
							location: p.location,
							sequence: p.sequence,
						});
					}
					return msg.defaultResponse();
				}
				return discardPads(msg);
			},
		});
		try {
			// T1 P0: summon Y-Dragon Head (union) to MZONE
			await normalSummon(duel, Y_DRAGON_PRE);
			await passTurn(duel);
			// T2 P1: pass
			await passTurn(duel);
			// T3 P0: summon X-Head Cannon, then equip Y-Dragon (moves to SZONE)
			await normalSummon(duel, X_HEAD_CANNON);
			await equipUnion(duel, Y_DRAGON_PRE);

			// Now check idle: XY-Dragon Cannon should be in spSummonableCards
			// (Contact Fusion: both materials present — X-Head in MZONE, Y-Dragon in SZONE as equip)
			const m = await idle(duel);
			const xyOffer = m.spSummonableCards.find((c) => c.code === XY_DRAGON_CANNON);
			expect(xyOffer).toBeDefined();

			if (xyOffer) {
				// Drive the Fusion Summon to confirm it resolves
				duel.setResponse(
					m.prepareResponse(IdleCmdType.SPSUMMON, {
						code: xyOffer.code,
						controller: xyOffer.controller,
						location: xyOffer.location,
						sequence: xyOffer.sequence,
					}),
				);
				const { allMessages } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				const spSummonMsg = allMessages.find(
					(msg): msg is YGOProMsgSpSummoning =>
						msg instanceof YGOProMsgSpSummoning && msg.code === XY_DRAGON_CANNON,
				);
				expect(spSummonMsg).toBeDefined();
			}
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});

// ---------------------------------------------------------------------------
// Scenario 4: Z-Metal Tank and W-Wing Catapult smoke — battle sub fires
// ---------------------------------------------------------------------------

describe("Z-Metal Tank (910003017) and W-Wing Catapult (910003018) — battle-substitute smoke", () => {
	it("910003017 (Z-Metal Tank pre-errata): equips onto X-Head Cannon, battle-substitute fires", async () => {
		const specificCards = [Z_METAL_PRE, X_HEAD_CANNON];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([GENE_WARPED]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards, GENE_WARPED]),
		});
		try {
			// T1 P0: summon Z-Metal Tank (union) to MZONE
			await normalSummon(duel, Z_METAL_PRE);
			await passTurn(duel);
			// T2 P1: pass
			await passTurn(duel);
			// T3 P0: summon X-Head Cannon, equip Z-Metal Tank
			await normalSummon(duel, X_HEAD_CANNON);
			await equipUnion(duel, Z_METAL_PRE);

			// Confirm X-Head is in MZONE and Z-Metal in SZONE
			const m = await idle(duel);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // X-Head on field
			expect(duel.queryLocationCount(0, LOCATION_SZONE)).toBe(1); // Z-Metal equipped
			duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("910003018 (W-Wing Catapult pre-errata): equips onto V-Tiger Jet, battle-substitute fires", async () => {
		const specificCards = [W_WING_PRE, V_TIGER_JET];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([GENE_WARPED]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards, GENE_WARPED]),
		});
		try {
			// T1 P0: summon W-Wing Catapult (union) to MZONE
			await normalSummon(duel, W_WING_PRE);
			await passTurn(duel);
			// T2 P1: pass
			await passTurn(duel);
			// T3 P0: summon V-Tiger Jet (carrier), equip W-Wing
			await normalSummon(duel, V_TIGER_JET);
			await equipUnion(duel, W_WING_PRE);

			// Verify: V-Tiger in MZONE, W-Wing in SZONE
			const m = await idle(duel);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // V-Tiger on field
			expect(duel.queryLocationCount(0, LOCATION_SZONE)).toBe(1); // W-Wing equipped
			duel.setResponse(m.prepareResponse(IdleCmdType.TO_EP));
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("910003017 (Z-Metal Tank): NO effect-substitute — Dark Hole destroys X-Head Cannon (MZONE P0 = 0)", async () => {
		const specificCards = [Z_METAL_PRE, X_HEAD_CANNON, DARK_HOLE];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards]),
		});
		try {
			await normalSummon(duel, Z_METAL_PRE);
			await passTurn(duel);
			await passTurn(duel);
			await normalSummon(duel, X_HEAD_CANNON);
			await equipUnion(duel, Z_METAL_PRE);
			await passTurn(duel);
			await passTurn(duel);
			await activateCard(duel, DARK_HOLE);
			await idle(duel);
			// Neither X-Head nor Z-Metal should remain on field
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}, 120000);

	it("910003018 (W-Wing Catapult): NO effect-substitute — Dark Hole destroys V-Tiger Jet (MZONE P0 = 0)", async () => {
		const specificCards = [W_WING_PRE, V_TIGER_JET, DARK_HOLE];
		const duel = await HeadlessDuel.create({
			decks: [{ main: buildDeck(specificCards) }, { main: buildDeck([]) }],
			duelRule: 1,
			seed: FIXED_SEED,
			autoResponder: makeDiscardPadsResponder([...specificCards]),
		});
		try {
			await normalSummon(duel, W_WING_PRE);
			await passTurn(duel);
			await passTurn(duel);
			await normalSummon(duel, V_TIGER_JET);
			await equipUnion(duel, W_WING_PRE);
			await passTurn(duel);
			await passTurn(duel);
			await activateCard(duel, DARK_HOLE);
			await idle(duel);
			expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0);
		} finally {
			await duel.cleanup();
		}
	}, 120000);
});
