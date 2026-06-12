import { YGOProStocJoinGame } from "ygopro-msg-encode";
import { YGOProMessageRepository } from "./YGOProMessageRepository";
import { HostInfo } from "../domain/host-info/HostInfo";
import { GameMode } from "ygopro-msg-encode";

const hostInfo: HostInfo = {
	lflist: 2, // in-memory banlist INDEX — must never reach the wire
	rule: 5,
	mode: GameMode.SINGLE,
	duel_rule: 1,
	no_check_deck: 0,
	no_shuffle_deck: 0,
	start_lp: 8000,
	start_hand: 5,
	draw_count: 1,
	time_limit: 450,
	max_deck_points: 100,
	best_of: 1,
};

const EDISON_HASH = 2186248606;

describe("YGOProMessageRepository.joinGameMessage", () => {
	it("sends the banlist HASH on the wire, not the in-memory index (srvpro2 room.ts:297)", () => {
		const repository = new YGOProMessageRepository();

		const actual = repository.joinGameMessage(hostInfo, EDISON_HASH);

		const expected = Buffer.from(
			new YGOProStocJoinGame()
				.fromPartial({ info: { ...hostInfo, lflist: EDISON_HASH } })
				.toFullPayload(),
		);
		expect(actual.equals(expected)).toBe(true);

		const withIndex = Buffer.from(
			new YGOProStocJoinGame().fromPartial({ info: hostInfo }).toFullPayload(),
		);
		expect(actual.equals(withIndex)).toBe(false);
	});

	it("sends 0 for rooms without a banlist", () => {
		const repository = new YGOProMessageRepository();

		const actual = repository.joinGameMessage(hostInfo, 0);

		const expected = Buffer.from(
			new YGOProStocJoinGame()
				.fromPartial({ info: { ...hostInfo, lflist: 0 } })
				.toFullPayload(),
		);
		expect(actual.equals(expected)).toBe(true);
	});
});
