import { RoomMother } from "@test-support/mothers/room/RoomMother";

const MASTER_RULES: [string, number][] = [
	["Master Rule 1", 0xd0700],
	["Master Rule 2", 0xd0600],
	["Master Rule 3", 0xd1800],
	["Master Rule 4", 0xd2800],
	["Master Rule 5", 0x2e800],
];
const MASTER_RULE_5 = 0x2e800;
const DUEL_PSEUDO_SHUFFLE = 0x10;
const DUEL_RELAY = 0x80;
const DUEL_NO_MAIN_PHASE_2 = 0x200000;
const TCG_SEGOC_NONPUBLIC_HIGH = 0x1;
const EXTRA_DECK_RITUAL_HIGH = 0x8;
const SPEED_DUEL = 0x628000;
const RUSH_DUEL = 0x7f28200;

function room(params: Parameters<typeof RoomMother.create>[0] = {}) {
	return RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: MASTER_RULE_5, ...params });
}

describe("Room.seatsYgoproClients", () => {
	it.each(MASTER_RULES)("seats one in a 1v1 room under %s", (_name, duelFlagsLow) => {
		expect(room({ duelFlagsLow }).seatsYgoproClients).toBe(true);
	});

	it("ignores the flags that do not change the board: shuffling and the TCG trigger order", () => {
		const flagged = room({
			duelFlagsLow: MASTER_RULE_5 | DUEL_PSEUDO_SHUFFLE,
			duelFlagsHight: TCG_SEGOC_NONPUBLIC_HIGH,
		});

		expect(flagged.seatsYgoproClients).toBe(true);
	});

	it("seats one in a 1v1 Speed Duel room", () => {
		expect(room({ duelFlagsLow: SPEED_DUEL }).seatsYgoproClients).toBe(true);
	});

	it("seats one in a 2v2 tag room", () => {
		expect(room({ team0: 2, team1: 2 }).seatsYgoproClients).toBe(true);
	});

	it("seats one in a 2v2 relay room", () => {
		const relay = room({ team0: 2, team1: 2, duelFlagsLow: MASTER_RULE_5 | DUEL_RELAY });

		expect(relay.seatsYgoproClients).toBe(true);
	});

	it.each([
		["a Rush Duel", { duelFlagsLow: RUSH_DUEL, duelFlagsHight: EXTRA_DECK_RITUAL_HIGH }],
		["a Master Rule with one flag changed", { duelFlagsLow: MASTER_RULE_5 | DUEL_NO_MAIN_PHASE_2 }],
		["a Master Rule with a custom high flag", { duelFlagsHight: EXTRA_DECK_RITUAL_HIGH }],
		["a room with an extra rule", { extraRules: 1 }],
		["a 3v3 room", { team0: 3, team1: 3 }],
		["a room with uneven teams", { team0: 1, team1: 2 }],
		["a 3v3 relay room", { team0: 3, team1: 3, duelFlagsLow: MASTER_RULE_5 | DUEL_RELAY }],
	])("does not seat one in %s", (_name, params) => {
		expect(room(params).seatsYgoproClients).toBe(false);
	});
});
