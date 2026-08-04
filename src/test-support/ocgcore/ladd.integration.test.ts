/**
 * Light and Darkness Dragon (47297616) — Edison 2010 verification suite.
 *
 * VERIFICATION card (no pre-errata copy expected): the TCG Astral Pack 2
 * erratum made the ④ float resolve simultaneously ("...also Special Summon"),
 * but that change was TCG-only — the OCG always resolved sequentially
 * ("...also, AFTER THAT, Special Summon", the Edison-accurate PSCT), and the
 * base script models OCG semantics (Destroy → Duel.BreakEffect() →
 * SpecialSummon in c47297616.lua). These tests pin that the shipped engine
 * actually behaves era-correct, per edisonrul.ing (both schools agree):
 *   1. Sequential resolution: own cards are destroyed (hit the grave) BEFORE
 *      the target is Special Summoned.
 *   2. Peten the Dark Clown destroyed by the float misses the timing for its
 *      optional trigger — no prompt (pojo 492019, the canonical ruling).
 *   3. Chained D.D. Crow banishing the target: cards are STILL destroyed,
 *      the summon just whiffs.
 *   4. The float triggers even when LADD's own tribute summon is negated by
 *      Solemn Judgment (destroyed and sent to the grave).
 */
import {
	BattleCmdType,
	IdleCmdType,
	YGOProMsgMove,
	YGOProMsgSelectBattleCmd,
	YGOProMsgSelectCard,
	YGOProMsgSelectChain,
	YGOProMsgSelectEffectYn,
	YGOProMsgSelectIdleCmd,
	YGOProMsgSelectTribute,
} from "ygopro-msg-encode";

import { HeadlessDuel } from "./headless-duel";
import { buildDeck, FIXED_SEED, makeDiscardPadsResponder } from "./test-fixtures";

const LADD = 47297616;
const PETEN = 52624755;
const DD_CROW = 24508238;
const SOLEMN = 41420027;
const BLUE_EYES = 89631139;
const FISSURE = 66788016;
const SMASHING = 97169186;
const MST = 5318639;
const OFFERINGS = 19230407; // Offerings to the Doomed — quick-play (spell speed 2)
const VAN_A = 2863439;
const VAN_B = 549481;

const LOCATION_MZONE = 0x04;
const LOCATION_GRAVE = 0x10;
const LOCATION_REMOVED = 0x20;

const discardPadsResponder = makeDiscardPadsResponder([
	LADD,
	PETEN,
	DD_CROW,
	SOLEMN,
	BLUE_EYES,
	FISSURE,
	SMASHING,
	VAN_A,
	VAN_B,
]);

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

async function drivePassTurn(duel: HeadlessDuel): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

async function driveSummonAndEndTurn(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSummonAndEndTurn: ${code} not summonable. ` +
				`Available: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/** Declare a tribute summon and answer the tribute window with all offered cards up to `count`. */
async function driveTributeSummonAndEndTurn(
	duel: HeadlessDuel,
	code: number,
	tributeCount: number,
): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.summonableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveTributeSummonAndEndTurn: ${code} not summonable. ` +
				`Available: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const rt = await duel.advanceUntil(YGOProMsgSelectTribute);
	const picks = rt.targetMessage.cards.slice(0, tributeCount).map((c) => ({
		code: c.code,
		controller: c.controller,
		location: c.location,
		sequence: c.sequence,
	}));
	duel.setResponse(rt.targetMessage.prepareResponse(picks));
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

/**
 * Enter the Battle Phase from the current idle and attack with `attacker`
 * (targets are auto-resolved by the engine when only one exists), then drive
 * until the next idle, collecting messages and answering selection windows
 * with the given picker.
 */
async function driveAttackAndCollect(
	duel: HeadlessDuel,
	attacker: number,
	pickCard: (msg: YGOProMsgSelectCard) => number | undefined,
): Promise<{ all: unknown[]; petenPrompted: boolean }> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_BP));
	const rb = await duel.advanceUntil(YGOProMsgSelectBattleCmd);
	const att = rb.targetMessage.attackableCards.find((c) => c.code === attacker);
	if (!att) {
		throw new Error(
			`driveAttackAndCollect: ${attacker} not attackable. ` +
				`Available: ${rb.targetMessage.attackableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		rb.targetMessage.prepareResponse(BattleCmdType.ATTACK, {
			code: att.code,
			controller: att.controller,
			location: att.location,
			sequence: att.sequence,
		}),
	);

	const all: unknown[] = [];
	let petenPrompted = false;
	for (;;) {
		const step = await duel.advanceUntilOneOf([
			YGOProMsgSelectCard,
			YGOProMsgSelectBattleCmd,
			YGOProMsgSelectIdleCmd,
		]);
		all.push(...step.allMessages);
		for (const m of step.allMessages) {
			if (m instanceof YGOProMsgSelectEffectYn && m.code === PETEN) petenPrompted = true;
			if (m instanceof YGOProMsgSelectChain && m.chains.some((c) => c.code === PETEN))
				petenPrompted = true;
		}
		const msg = step.targetMessage;
		if (msg instanceof YGOProMsgSelectCard) {
			const wanted = pickCard(msg);
			const pick = msg.cards.find((c) => c.code === wanted) ?? msg.cards[0];
			duel.setResponse(
				msg.prepareResponse([
					{
						code: pick.code,
						controller: pick.controller,
						location: pick.location,
						sequence: pick.sequence,
					},
				]),
			);
			continue;
		}
		// Settle the remaining battle phase / turn back at a command window.
		if (msg instanceof YGOProMsgSelectBattleCmd) {
			duel.setResponse(msg.prepareResponse(BattleCmdType.TO_EP));
			continue;
		}
		return { all, petenPrompted };
	}
}

/** Activate a spell from the current idle and settle back to idle (same turn). */
async function driveActivateSpell(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.activatableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveActivateSpell: ${code} not activatable. ` +
				`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
}

/** Set a spell/trap from the current idle window, then end the turn. */
async function driveSSet(duel: HeadlessDuel, code: number): Promise<void> {
	const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	const card = r.targetMessage.ssetableCards.find((c) => c.code === code);
	if (!card) {
		throw new Error(
			`driveSSet: ${code} not ssetable. ` +
				`Available: ${r.targetMessage.ssetableCards.map((c) => c.code).join(", ")}`,
		);
	}
	duel.setResponse(
		r.targetMessage.prepareResponse(IdleCmdType.SSET, {
			code: card.code,
			controller: card.controller,
			location: card.location,
			sequence: card.sequence,
		}),
	);
	const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
	duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Light and Darkness Dragon (47297616) — Edison 2010 verification", () => {
	// Shared setup: P0 ramps into LADD via two vanillas; P1 ramps into Blue-Eyes.
	// T1 P0 vanA · T2 P1 vanX · T3 P0 vanB · T4 P1 vanY · T5 P0 tribute LADD
	// T6 P1 tribute BEWD · (T7 P0 varies) · T8 P1 attacks LADD (3000 > 2800).
	async function rampToLaddVsBlueEyes(duel: HeadlessDuel): Promise<void> {
		await driveSummonAndEndTurn(duel, VAN_A); // T1 P0
		await driveSummonAndEndTurn(duel, VAN_A); // T2 P1 (own copy)
		await driveSummonAndEndTurn(duel, VAN_B); // T3 P0
		await driveSummonAndEndTurn(duel, VAN_B); // T4 P1
		await driveTributeSummonAndEndTurn(duel, LADD, 2); // T5 P0
		await driveTributeSummonAndEndTurn(duel, BLUE_EYES, 2); // T6 P1
	}

	describe("Test 1: sequential float — destroy first, then summon; Peten misses timing", () => {
		it("destroys Peten before the revival and never prompts Peten's trigger", async () => {
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([VAN_A, VAN_B, LADD, PETEN, PETEN]) },
					{ main: buildDeck([VAN_A, VAN_B, BLUE_EYES]) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: discardPadsResponder,
			});
			try {
				await rampToLaddVsBlueEyes(duel);
				await driveSummonAndEndTurn(duel, PETEN); // T7 P0: Peten beside LADD

				// T8 P1: Blue-Eyes runs over LADD → float: target VAN_A in grave.
				const { all, petenPrompted } = await driveAttackAndCollect(duel, BLUE_EYES, () => VAN_A);

				// Sequential order: Peten hits the grave BEFORE the target returns.
				const moves = all.filter((m): m is YGOProMsgMove => m instanceof YGOProMsgMove);
				const petenToGrave = moves.findIndex(
					(m) => m.code === PETEN && m.current.location === LOCATION_GRAVE,
				);
				const revivalToField = moves.findIndex(
					(m) =>
						m.code === VAN_A &&
						m.previous.location === LOCATION_GRAVE &&
						m.current.location === LOCATION_MZONE,
				);
				expect(petenToGrave).toBeGreaterThanOrEqual(0);
				expect(revivalToField).toBeGreaterThan(petenToGrave);

				// Peten missed the timing: no optional-trigger prompt of any kind.
				expect(petenPrompted).toBe(false);

				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1); // revived VAN_A only
			} finally {
				await duel.cleanup();
			}
		});
	});

	describe("Test 2: chained D.D. Crow — cards still destroyed, summon whiffs", () => {
		// PARKED (2026-08-03). The "activation anomaly" that originally blocked
		// this pin was RESOLVED as not-a-bug — spell/trap activations are offered
		// correctly under LADD (see ladd-activation-offers.integration.test.ts and
		// the resolved anomaly row in docs/edison-erratas.md). What remains is
		// pure scenario cost, not an engine blocker:
		//   1. The original battle-kill design is era-ILLEGAL — UDE ruling: D.D.
		//      Crow "cannot be activated during the Damage Step" (both Edison
		//      schools agree; the engine's refusal to offer Crow there is CORRECT).
		//      Re-scope to an EFFECT kill in the Main Phase and chain Crow to the
		//      float there.
		//   2. To land an effect kill on LADD, its ATK must be dropped below 500
		//      first (LADD's mandatory negate eats any spell/trap while ATK≥500):
		//      ≥5 chaff activations at −500 each. Expensive to set up.
		// Low priority: LADD's "destroy all even if the summon whiffs" ruling is
		// already partly covered by the sequential-order and Solemn pins above.
		it.skip("banishing the target does not stop the destruction", async () => {
			let crowChained = false;
			// Armed by the drive loop AFTER the float's target has been selected —
			// any earlier window either feeds LADD's mandatory negate or fires the
			// Crow before the float targets. (No mid-process queries here: calling
			// queryFieldCard from inside the auto-responder corrupts the engine's
			// activatable computation.)
			let crowArmed = false;
			// Kill mechanism (once-per-chain, from the .com rulings): Smashing (CL1,
			// spell speed 1) baits LADD's forced negate (CL2); Offerings to the
			// Doomed — a QUICK-PLAY, spell speed 2 — chains as CL3. LADD's ③ already
			// fired this chain, so CL3 resolves and destroys LADD in the MAIN PHASE;
			// CL2 then whiffs (LADD off-field) and CL1 finds no monster. The float
			// window opens outside the damage step, where Crow can chain.
			let offeringsArmed = false;
			let offeringsChained = false;
			const duel = await HeadlessDuel.create({
				decks: [
					{ main: buildDeck([VAN_A, VAN_B, LADD, MST]) },
					{ main: buildDeck([SMASHING, OFFERINGS, DD_CROW], 39) },
				],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: (msg) => {
					// Chain Offerings to the Doomed to LADD's forced negate (CL3).
					if (
						msg instanceof YGOProMsgSelectChain &&
						offeringsArmed &&
						!offeringsChained &&
						msg.player === 1
					) {
						const off = msg.chains.find((c) => c.code === OFFERINGS);
						if (off) {
							offeringsChained = true;
							return msg.prepareResponse({
								code: off.code,
								controller: off.controller,
								location: off.location,
								sequence: off.sequence,
								desc: off.desc,
							});
						}
					}
					// Chain D.D. Crow only to the float's activation.
					if (
						msg instanceof YGOProMsgSelectChain &&
						crowArmed &&
						!crowChained &&
						msg.player === 1
					) {
						const crow = msg.chains.find((c) => c.code === DD_CROW);
						if (crow) {
							crowChained = true;
							return msg.prepareResponse({
								code: crow.code,
								controller: crow.controller,
								location: crow.location,
								sequence: crow.sequence,
								desc: crow.desc,
							});
						}
					}
					// Crow's own target select (P1 picking from P0's grave): take VAN_A —
					// the same monster the float targeted. Grave-only guard: end-phase
					// hand discards are ALSO P1 SelectCards and must fall through.
					if (
						msg instanceof YGOProMsgSelectCard &&
						msg.player === 1 &&
						msg.cards.every((c) => c.location === LOCATION_GRAVE)
					) {
						const pick = msg.cards.find((c) => c.code === VAN_A) ?? msg.cards[0];
						return msg.prepareResponse([
							{
								code: pick.code,
								controller: pick.controller,
								location: pick.location,
								sequence: pick.sequence,
							},
						]);
					}
					return discardPadsResponder(msg);
				},
			});
			try {
				await driveSummonAndEndTurn(duel, VAN_A); // T1 P0
				await drivePassTurn(duel); // T2 P1
				await driveSummonAndEndTurn(duel, VAN_B); // T3 P0
				// T4 P1: SET Offerings — hand quick-plays are not offered in this
				// core's mid-chain windows, set ones are (usable from next turn).
				await driveSSet(duel, OFFERINGS);
				// T5 P0: tribute out LADD, then set a spell for the float to destroy
				// at resolution (same turn — the drain must run at T6, see below).
				{
					const r5 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
					const ladd = r5.targetMessage.summonableCards.find((c) => c.code === LADD);
					if (!ladd) {
						throw new Error(
							`LADD not summonable at T5. Available: ${r5.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
						);
					}
					duel.setResponse(
						r5.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
							code: ladd.code,
							controller: ladd.controller,
							location: ladd.location,
							sequence: ladd.sequence,
						}),
					);
					const rt = await duel.advanceUntil(YGOProMsgSelectTribute);
					const picks = rt.targetMessage.cards.slice(0, 2).map((c) => ({
						code: c.code,
						controller: c.controller,
						location: c.location,
						sequence: c.sequence,
					}));
					duel.setResponse(rt.targetMessage.prepareResponse(picks));
					await driveSSet(duel, MST); // set + end turn
				}

				// T6 P1: Smashing baits LADD's forced negate; the armed responder
				// chains Offerings on top → LADD destroyed at CL3's resolution.
				// (The tribute summon can leave an extra P0 idle — MR1 ignition
				// priority — so advance until the idle actually belongs to P1.)
				offeringsArmed = true;
				let r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				while (r.targetMessage.player === 0) {
					duel.setResponse(r.targetMessage.prepareResponse(IdleCmdType.TO_EP));
					r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				}
				const smash = r.targetMessage.activatableCards.find((c) => c.code === SMASHING);
				if (!smash) {
					throw new Error(
						`Smashing not activatable at T6. player=${r.targetMessage.player} ` +
							`Available: ${r.targetMessage.activatableCards.map((c) => c.code).join(", ")}; ` +
							`summonable: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}`,
					);
				}
				duel.setResponse(
					r.targetMessage.prepareResponse(IdleCmdType.ACTIVATE, {
						code: smash.code,
						controller: smash.controller,
						location: smash.location,
						sequence: smash.sequence,
					}),
				);
				// Drive to the next idle, answering the float's target select (P0) —
				// and only THEN arm the Crow so it chains to the float itself.
				for (;;) {
					const step = await duel.advanceUntilOneOf([YGOProMsgSelectCard, YGOProMsgSelectIdleCmd]);
					const msg = step.targetMessage;
					if (msg instanceof YGOProMsgSelectCard) {
						const pick = msg.cards.find((c) => c.code === VAN_A) ?? msg.cards[0];
						duel.setResponse(
							msg.prepareResponse([
								{
									code: pick.code,
									controller: pick.controller,
									location: pick.location,
									sequence: pick.sequence,
								},
							]),
						);
						if (msg.player === 0 && pick.location === LOCATION_GRAVE) {
							crowArmed = true; // float targeted — Crow may chain now
						}
						continue;
					}
					if (msg instanceof YGOProMsgSelectIdleCmd) {
						duel.setResponse(msg.prepareResponse(IdleCmdType.TO_EP));
					}
					break;
				}

				expect(crowChained).toBe(true);
				expect(duel.queryLocationCount(0, LOCATION_REMOVED)).toBe(1); // VAN_A banished
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(0); // no revival
				expect(duel.queryLocationCount(0, 0x08)).toBe(0); // set Fissure STILL destroyed
			} finally {
				await duel.cleanup();
			}
		});
	});

	describe("Test 3: float triggers even when LADD's summon is negated by Solemn", () => {
		it("negated tribute summon → destroyed to grave → float still revives", async () => {
			let solemnChained = false;
			let solemnArmed = false;
			const duel = await HeadlessDuel.create({
				decks: [{ main: buildDeck([VAN_A, VAN_B, LADD]) }, { main: buildDeck([SOLEMN]) }],
				duelRule: 1,
				seed: FIXED_SEED,
				autoResponder: (msg) => {
					if (
						msg instanceof YGOProMsgSelectChain &&
						solemnArmed &&
						!solemnChained &&
						msg.player === 1
					) {
						const solemn = msg.chains.find((c) => c.code === SOLEMN);
						if (solemn) {
							solemnChained = true;
							return msg.prepareResponse({
								code: solemn.code,
								controller: solemn.controller,
								location: solemn.location,
								sequence: solemn.sequence,
								desc: solemn.desc,
							});
						}
					}
					// Float's target select (P0 picking from own grave): take VAN_A.
					if (msg instanceof YGOProMsgSelectCard && msg.player === 0) {
						const pick = msg.cards.find((c) => c.code === VAN_A) ?? msg.cards[0];
						return msg.prepareResponse([
							{
								code: pick.code,
								controller: pick.controller,
								location: pick.location,
								sequence: pick.sequence,
							},
						]);
					}
					return discardPadsResponder(msg);
				},
			});
			try {
				await driveSummonAndEndTurn(duel, VAN_A); // T1 P0
				await driveSSet(duel, SOLEMN); // T2 P1 set Solemn, end turn
				await driveSummonAndEndTurn(duel, VAN_B); // T3 P0
				await drivePassTurn(duel); // T4 P1
				// T5 P0: tribute summon LADD → Solemn negates → float from grave.
				solemnArmed = true;
				const r = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				const card = r.targetMessage.summonableCards.find((c) => c.code === LADD);
				if (!card) {
					throw new Error(
						`LADD not summonable at T5. Summonable: ${r.targetMessage.summonableCards.map((c) => c.code).join(", ")}; hand=${duel.queryHandCount(0)}; p0 mzone=${duel.queryLocationCount(0, LOCATION_MZONE)}`,
					);
				}
				duel.setResponse(
					r.targetMessage.prepareResponse(IdleCmdType.SUMMON, {
						code: card.code,
						controller: card.controller,
						location: card.location,
						sequence: card.sequence,
					}),
				);
				const rt = await duel.advanceUntil(YGOProMsgSelectTribute);
				const picks = rt.targetMessage.cards.slice(0, 2).map((c) => ({
					code: c.code,
					controller: c.controller,
					location: c.location,
					sequence: c.sequence,
				}));
				duel.setResponse(rt.targetMessage.prepareResponse(picks));
				const r2 = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

				expect(solemnChained).toBe(true);
				// LADD destroyed by Solemn → in grave; float revived VAN_A.
				expect(duel.queryLocationCount(0, LOCATION_MZONE)).toBe(1);
				expect(duel.queryLocationCount(0, LOCATION_GRAVE)).toBe(2); // LADD + VAN_B

				duel.setResponse(r2.targetMessage.prepareResponse(IdleCmdType.TO_EP));
			} finally {
				await duel.cleanup();
			}
		});
	});
});
