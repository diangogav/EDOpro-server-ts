/**
 * MR1 behavior test — slice 1: duel boots and turn-1 draw happens.
 *
 * Master Rule 1 (duel_rule = 1) draws on turn 1. The draw phase runs before
 * the first SelectIdleCmd, so at that point the turn player must hold
 * 6 cards (5 opening hand + 1 drawn).
 *
 * duel_rule >= 3 (MR3 / New Master Rule / MR2020) skips the turn-1 draw
 * for the first player. MR1 and MR2 do NOT skip it.
 */

import { YGOProMsgSelectIdleCmd } from "ygopro-msg-encode";
import { HeadlessDuel } from "./headless-duel";
import { FIXED_SEED } from "./test-fixtures";

// WASM init + sql.js + card DB load can take several seconds.
jest.setTimeout(30_000);

// ---------------------------------------------------------------------------
// Fixture deck — 40 vanilla normal monsters confirmed present in classic.cdb.
// Codes verified against resources/current/ygopro/classic/classic.cdb.
// ---------------------------------------------------------------------------
const FIXTURE_DECK: number[] = [
	549481, // Lv4 normal monster (ATK 500 / DEF 2000)
	732302, // Lv4 normal monster
	1184620, // Lv4 normal monster
	1784619, // Lv4 normal monster
	2118022, // Lv4 normal monster
	2311603, // Lv4 normal monster
	2483611, // Lv4 normal monster
	2863439, // Lv4 normal monster
	3134241, // Lv4 normal monster
	3170832, // Lv4 normal monster
	4042268, // Lv4 normal monster
	5053103, // Lv4 normal monster
	5265750, // Lv4 normal monster
	5388481, // Lv4 normal monster
	5434080, // Lv4 normal monster
	5464695, // Lv4 normal monster
	5628232, // Lv4 normal monster
	5818798, // Lv4 normal monster
	7359741, // Lv4 normal monster
	7459013, // Lv4 normal monster
	8471389, // Lv4 normal monster
	10071456, // Lv4 normal monster
	9748752, // Caius the Shadow Monarch (Lv6 effect, confirmed present)
	// Pad to 40 by repeating the first 17 entries (same code = same card slot;
	// ocgcore allows repeated codes in deck loading for test purposes)
	549481,
	732302,
	1184620,
	1784619,
	2118022,
	2311603,
	2483611,
	2863439,
	3134241,
	3170832,
	4042268,
	5053103,
	5265750,
	5388481,
	5434080,
	5464695,
	5628232,
];

describe("MR1 duel — boot and turn-1 draw behavior", () => {
	describe("boot sequence", () => {
		it("reaches the first SelectIdleCmd without throwing", async () => {
			const duel = await HeadlessDuel.create({
				decks: [{ main: FIXTURE_DECK }, { main: FIXTURE_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});

			try {
				const { targetMessage } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);
				expect(targetMessage).toBeInstanceOf(YGOProMsgSelectIdleCmd);
			} finally {
				await duel.cleanup();
			}
		});
	});

	describe("turn-1 draw (MR1 behavior)", () => {
		it("turn player has 6 cards in hand at first SelectIdleCmd (5 opening + 1 drawn)", async () => {
			const duel = await HeadlessDuel.create({
				decks: [{ main: FIXTURE_DECK }, { main: FIXTURE_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});

			try {
				const { allMessages, targetMessage } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

				const idleCmd = targetMessage as YGOProMsgSelectIdleCmd;
				const turnPlayer = idleCmd.player;

				// Primary assertion: engine field count (most authoritative source)
				const handCount = duel.queryHandCount(turnPlayer);
				expect(handCount).toBe(6);

				// Secondary assertion: MSG_DRAW replay agrees
				const handFromMessages = HeadlessDuel.countHandFromMessages(allMessages, turnPlayer);
				expect(handFromMessages).toBe(6);
			} finally {
				await duel.cleanup();
			}
		});

		it("non-turn player also has 5 cards in hand at first SelectIdleCmd", async () => {
			const duel = await HeadlessDuel.create({
				decks: [{ main: FIXTURE_DECK }, { main: FIXTURE_DECK }],
				duelRule: 1,
				seed: FIXED_SEED,
			});

			try {
				const { targetMessage } = await duel.advanceUntil(YGOProMsgSelectIdleCmd);

				const idleCmd = targetMessage as YGOProMsgSelectIdleCmd;
				const nonTurnPlayer = 1 - idleCmd.player;

				const handCount = duel.queryHandCount(nonTurnPlayer);
				expect(handCount).toBe(5);
			} finally {
				await duel.cleanup();
			}
		});
	});
});
