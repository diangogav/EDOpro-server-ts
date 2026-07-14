import "reflect-metadata";

import { EventEmitter } from "stream";

import { GameMode } from "ygopro-msg-encode";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { PlayerInfoMessageMother } from "@test-support/mothers/PlayerInfoMessageMother";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { YGOProBanList } from "@ygopro/ban-list/domain/YGOProBanList";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { YGOProRoom } from "./YGOProRoom";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";

function createBanList(name: string, hash: number): YGOProBanList {
	const banList = new YGOProBanList();
	banList.setName(name);
	banList.setHash(hash);
	return banList;
}

describe("YGOProRoom", () => {
	it("Should create a room with `mode` 1 (Match) when command has `m`", () => {
		const room = YGOProRoomMother.create({ command: "m#123" });
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
	});

	it("Should create a room with `mode` 2 (Tag) and `start_lp` 16000 when command has `t`", () => {
		const room = YGOProRoomMother.create({ command: "t#123" });
		expect(room.hostInfo.mode).toBe(GameMode.TAG);
		expect(room.hostInfo.start_lp).toBe(16000);
	});

	it("Should create a room with start_lp passing by `lp` command: example lp4000 should create a room with `start_lp` equal to 4000", () => {
		const room = YGOProRoomMother.create({ command: "lp4000#123" });
		expect(room.hostInfo.start_lp).toBe(4000);
	});

	it("Should create a room with Match mode and 6000 lps if command is lp6000,m#123", () => {
		const room = YGOProRoomMother.create({ command: "lp6000,m#123" });
		expect(room.hostInfo.start_lp).toBe(6000);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
	});

	it("Should create a room with Tag mode and 12000 lps if command is t,lp12000#123", () => {
		const room = YGOProRoomMother.create({ command: "t,lp12000#123" });
		expect(room.hostInfo.start_lp).toBe(12000);
		expect(room.hostInfo.mode).toBe(GameMode.TAG);
	});

	it("Should create a room with Tag mode and 12000 lps if command is lp12000,t#123", () => {
		const room = YGOProRoomMother.create({ command: "lp12000,t#123" });
		expect(room.hostInfo.start_lp).toBe(12000);
		expect(room.hostInfo.mode).toBe(GameMode.TAG);
	});

	it("Should create a room with Match mode and duel rule 2 if command is mr2,m#123", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m#123" });
		expect(room.hostInfo.duel_rule).toBe(2);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
	});

	it("Should create a room with Match mode and duel rule 2 if command is duelrule2,m#123", () => {
		const room = YGOProRoomMother.create({ command: "duelrule2,m#123" });
		expect(room.hostInfo.duel_rule).toBe(2);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
	});

	it("Should create a single match room, allowing all cards from TCG and OCG (But the Forbidden/Limited List is still OCG's) sending rule 5 if command contains ot", () => {
		const room = YGOProRoomMother.create({ command: "ot#123" });
		expect(room.hostInfo.rule).toBe(5);
	});

	it("Should create a room with rule 5 if command contains tcg (alias of ot)", () => {
		const room = YGOProRoomMother.create({ command: "tcg#123" });
		expect(room.hostInfo.rule).toBe(5);
	});

	it("Should create a match room with rule 5 if command contains tcg,m", () => {
		const room = YGOProRoomMother.create({ command: "tcg,m#123" });
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
	});

	it("Should create a tag room, allowing all cards from TCG and OCG, with a life point total of 36000.", () => {
		const room = YGOProRoomMother.create({ command: "T,OT,LP36000#123" });
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.start_lp).toBe(36000);
		expect(room.hostInfo.mode).toBe(GameMode.TAG);
	});

	it("Should create an otto room with rule 5 (all cards), OCG banlist and match mode", () => {
		const room = YGOProRoomMother.create({ command: "otto,m,st7#123" });
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.lflist).toBe(0);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
		expect(room.hostInfo.start_hand).toBe(7);
		expect(room.useExtendedCardPool).toBe(false);
	});

	it("Should create a toot room with rule 5 (all cards), TCG banlist and match mode", () => {
		const room = YGOProRoomMother.create({ command: "toot,m,st7#123" });
		expect(room.hostInfo.rule).toBe(5);
		expect(room.hostInfo.mode).toBe(GameMode.MATCH);
		expect(room.hostInfo.start_hand).toBe(7);
		expect(room.useExtendedCardPool).toBe(false);
	});

	it("Should create room with timelimit of 300 segs (for values between 1 and 60 should be covert to seconds) if the command is tm5#123", () => {
		const room = YGOProRoomMother.create({ command: "tm5#123" });
		expect(room.hostInfo.time_limit).toBe(300);
		expect(room.hostInfo.start_lp).toBe(8000);
	});

	it("Should create room with timelimit of 300 segs (for values between 1 and 60 should be covert to seconds) if the command is time5#123", () => {
		const room = YGOProRoomMother.create({ command: "time5#123" });
		expect(room.hostInfo.time_limit).toBe(300);
		expect(room.hostInfo.start_lp).toBe(8000);
	});

	it("Should create room with timelimit of 500 segs if the command is tm500#123", () => {
		const room = YGOProRoomMother.create({ command: "tm500#123" });
		expect(room.hostInfo.time_limit).toBe(500);
		expect(room.hostInfo.start_lp).toBe(8000);
	});

	it("Should create room with timelimit passed by param if the param is greater than 60 and lower than 999, for example: tm1200#123", () => {
		const room = YGOProRoomMother.create({ command: "tm200#123" });
		expect(room.hostInfo.time_limit).toBe(200);
		expect(room.hostInfo.start_lp).toBe(8000);
	});

	it("Should create a room with the default timelimit if time command if not sent correctly", () => {
		const room = YGOProRoomMother.create({ command: "tm#123" });
		expect(room.hostInfo.time_limit).toBe(450);
		expect(room.hostInfo.start_lp).toBe(8000);
	});

	it("Should create a tag room with time params correctly", () => {
		const room = YGOProRoomMother.create({ command: "t,tm200#123" });
		expect(room.hostInfo.time_limit).toBe(200);
		expect(room.hostInfo.start_lp).toBe(16000);
		expect(room.hostInfo.mode).toBe(GameMode.TAG);
	});

	it("Should create a room without deck shuffling if ns param is send", () => {
		const room = YGOProRoomMother.create({ command: "m,ns#123" });
		expect(room.hostInfo.no_shuffle_deck).toBe(1);
	});

	it("Should create a room with deck shuffling if ns param is not send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m#123" });
		expect(room.hostInfo.no_shuffle_deck).toBe(0);
	});

	it("Should create a room without deck checking if nc param is send", () => {
		const room = YGOProRoomMother.create({ command: "m,nc#123" });
		expect(room.hostInfo.no_check_deck).toBe(1);
	});

	it("Should create a room with deck checking if nc param is not send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m#123" });
		expect(room.hostInfo.no_check_deck).toBe(0);
	});

	it("Should create a room with deck count 1 if dr param is not send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m#123" });
		expect(room.hostInfo.draw_count).toBe(1);
	});

	it("Should create a room with deck count passed by params if dr param is send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,dr9#123" });
		expect(room.hostInfo.draw_count).toBe(9);
	});

	it("Should create a room with deck count passed by params if draw param is send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,draw9#123" });
		expect(room.hostInfo.draw_count).toBe(9);
	});

	it("Should create a room with deck count 35 if dr param value is greater than 35", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,dr40#123" });
		expect(room.hostInfo.draw_count).toBe(35);
	});

	it("Should create a room with deck count 1 if dr param value is invalid", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,dr#123" });
		expect(room.hostInfo.draw_count).toBe(1);
	});

	it("Should create a room with start hand count 1 if st param is not send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m#123" });
		expect(room.hostInfo.start_hand).toBe(5);
	});

	it("Should create a room with start hand count passed by params if st param is send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,st10#123" });
		expect(room.hostInfo.start_hand).toBe(10);
	});

	it("Should create a room with start hand count 40 if st param value is greater than 40", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,st50#123" });
		expect(room.hostInfo.start_hand).toBe(40);
	});

	it("Should create a room with start hand count 5 if st param value is invalid", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,stundefined#123" });
		expect(room.hostInfo.start_hand).toBe(5);
	});

	it("Should create a room with start hand count 5 if st param value is lower than zero", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,st0#123" });
		expect(room.hostInfo.start_hand).toBe(5);
	});

	it("Should create a room with start hand count passed by params if start param is send", () => {
		const room = YGOProRoomMother.create({ command: "mr2,m,start10#123" });
		expect(room.hostInfo.start_hand).toBe(10);
	});

	describe("LFList command", () => {
		beforeEach(() => {
			YGOProBanListMemoryRepository.clear();
			for (let i = 0; i < 10; i++) {
				YGOProBanListMemoryRepository.add(createBanList(`BanList ${i}`, (i + 1) * 100));
			}
		});

		afterEach(() => {
			YGOProBanListMemoryRepository.clear();
		});

		it("Should create a room with the banlist hash at index (lf value - 1) through lf command", () => {
			const room = YGOProRoomMother.create({ command: "lf2#123" });
			expect(room.hostInfo.lflist).toBe(200);
		});

		it("Should create a room with the banlist hash at index (lf value - 1) through lflist command", () => {
			const room = YGOProRoomMother.create({ command: "lf10#123" });
			expect(room.hostInfo.lflist).toBe(1000);
		});
	});

	describe("OCG command", () => {
		it("Should create a room with rule 0 and lflist 0 if command is oor", () => {
			const room = YGOProRoomMother.create({ command: "oor#123" });
			expect(room.hostInfo.rule).toBe(0);
			expect(room.hostInfo.lflist).toBe(0);
		});

		it("Should create a room with rule 0 and lflist 0 if command is oo (alias of oor)", () => {
			const room = YGOProRoomMother.create({ command: "oo#123" });
			expect(room.hostInfo.rule).toBe(0);
			expect(room.hostInfo.lflist).toBe(0);
		});

		it("Should create a room with rule 0 and lflist 0 if command is ocgonly (alias of oor)", () => {
			const room = YGOProRoomMother.create({ command: "ocgonly#123" });
			expect(room.hostInfo.rule).toBe(0);
			expect(room.hostInfo.lflist).toBe(0);
		});

		it("Should create a room with rule 0 and lflist 0 if command is ocg", () => {
			const room = YGOProRoomMother.create({ command: "ocg#123" });
			expect(room.hostInfo.rule).toBe(0);
			expect(room.hostInfo.lflist).toBe(0);
		});

		it("Should create a match room with rule 0 if command is ocg,m", () => {
			const room = YGOProRoomMother.create({ command: "ocg,m#123" });
			expect(room.hostInfo.rule).toBe(0);
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
		});
	});

	describe("Edison Format", () => {
		it("Should create an edison room with rule 5, duel_rule 1 and start hand 6", () => {
			const room = YGOProRoomMother.create({ command: "edison,st6#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(1);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.start_hand).toBe(6);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("Master Duel Format", () => {
		it("Should create an md room with rule 5, duel_rule 5, match mode, start hand 6 and time limit 400", () => {
			const room = YGOProRoomMother.create({ command: "md,m,st6,tm400#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.start_hand).toBe(6);
			expect(room.hostInfo.time_limit).toBe(400);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("Genesys Format", () => {
		const GENESYS_HASH = 999;

		beforeEach(() => {
			YGOProBanListMemoryRepository.clear();
			YGOProBanListMemoryRepository.add(createBanList("2026.04 OCG", 100));
			YGOProBanListMemoryRepository.add(createBanList("2026.05 TCG", 200));
			YGOProBanListMemoryRepository.add(createBanList("Genesys", GENESYS_HASH));
		});

		afterEach(() => {
			YGOProBanListMemoryRepository.clear();
		});

		it("Should create a room with Genesys format if command contains genesys and the default points should be 100", () => {
			const room = YGOProRoomMother.create({ command: "genesys#123" });

			expect(room.hostInfo.rule).toBe(1);
			expect(room.banListHash).toBe(GENESYS_HASH);
			expect(room.hostInfo.max_deck_points).toBe(100);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.duel_rule).toBe(5);
		});

		it("Should be create a room with Genesys format if command contains genesys250 with max deck points 250", () => {
			const room = YGOProRoomMother.create({ command: "genesys250#123" });

			expect(room.hostInfo.rule).toBe(1);
			expect(room.banListHash).toBe(GENESYS_HASH);
			expect(room.hostInfo.max_deck_points).toBe(250);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.duel_rule).toBe(5);
		});

		it("Should create a room with Genesys format if command contains g and the default points should be 100", () => {
			const room = YGOProRoomMother.create({ command: "g#123" });
			expect(room.hostInfo.rule).toBe(1);
			expect(room.banListHash).toBe(GENESYS_HASH);
			expect(room.hostInfo.max_deck_points).toBe(100);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.duel_rule).toBe(5);
		});

		it("Should be create a room with Genesys format if command contains g300 with max deck points 300", () => {
			const room = YGOProRoomMother.create({ command: "G300#123" });

			expect(room.hostInfo.rule).toBe(1);
			expect(room.banListHash).toBe(GENESYS_HASH);
			expect(room.hostInfo.max_deck_points).toBe(300);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.duel_rule).toBe(5);
		});

		it("Should throw when creating a Genesys room and the Genesys ban list is not loaded", () => {
			YGOProBanListMemoryRepository.clear();
			YGOProBanListMemoryRepository.add(createBanList("2026.04 OCG", 100));

			expect(() => YGOProRoomMother.create({ command: "genesys#123" })).toThrow(
				"Genesys ban list is not loaded",
			);
		});
	});

	describe("Pre releases", () => {
		it("Should create a room with pre release format if command contains pre", () => {
			const room = YGOProRoomMother.create({ command: "PRE,NC,M,TM15#KIRITO" });

			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.time_limit).toBe(900);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.hostInfo.no_check_deck).toBe(1);
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
		});

		it("Should use extended card pool for pre format", () => {
			const room = YGOProRoomMother.create({ command: "pre#123" });
			expect(room.useExtendedCardPool).toBe(true);
		});

		it("Should create a tcgpre room with rule 5 (no scope restriction) and extended card pool", () => {
			const room = YGOProRoomMother.create({ command: "tcgpre,tm800#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.hostInfo.time_limit).toBe(800);
			expect(room.useExtendedCardPool).toBe(true);
		});

		it("Should create an ocgpre room with rule 5 (no scope restriction) and extended card pool", () => {
			const room = YGOProRoomMother.create({ command: "ocgpre#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.lflist).toBe(0);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.useExtendedCardPool).toBe(true);
		});

		it("Should create a tcgart room with rule 5 (no scope restriction) and extended card pool", () => {
			const room = YGOProRoomMother.create({ command: "tcgart,tm800#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.hostInfo.time_limit).toBe(800);
			expect(room.useExtendedCardPool).toBe(true);
		});

		it("Should create an ocgart room with rule 5 (no scope restriction) and extended card pool", () => {
			const room = YGOProRoomMother.create({ command: "ocgart#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.lflist).toBe(0);
			expect(room.hostInfo.duel_rule).toBe(5);
			expect(room.useExtendedCardPool).toBe(true);
		});

		it("Should NOT use extended card pool for standard formats", () => {
			const room = YGOProRoomMother.create({ command: "m#123" });
			expect(room.useExtendedCardPool).toBe(false);
		});

		it("Should NOT use extended card pool for ot format", () => {
			const room = YGOProRoomMother.create({ command: "ot#123" });
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("JTP Format", () => {
		it("Should create a jtp room with rule 5, duel_rule 2 and start hand 5", () => {
			const room = YGOProRoomMother.create({ command: "jtp,st5#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(2);
			expect(room.hostInfo.start_hand).toBe(5);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("Tengu Format", () => {
		it("Should create a tengu room with rule 5, duel_rule 2 and match mode", () => {
			const room = YGOProRoomMother.create({ command: "tengu,m#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(2);
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("HAT Format", () => {
		it("Should create a hat room with rule 5, duel_rule 2 and time_limit 450", () => {
			const room = YGOProRoomMother.create({ command: "hat#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(2);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("ranked override", () => {
		it("creates a ranked room when rankedOverride is true even without a game password", () => {
			const room = YGOProRoom.create(
				1,
				"TESTROOM",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(), // no password → ranked=false without override
				"sock-1",
				new MessageRepositoryMock(),
				true, // rankedOverride
			);
			expect(room.ranked).toBe(true);
		});

		it("creates an unranked room when rankedOverride is absent and no game password", () => {
			const room = YGOProRoom.create(
				2,
				"TESTROOM",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(), // no password → ranked=false
				"sock-2",
				new MessageRepositoryMock(),
				// no rankedOverride
			);
			expect(room.ranked).toBe(false);
		});

		it("creates an unranked room when the command carries the casual token, even with rankedOverride", () => {
			const room = YGOProRoom.create(
				3,
				"m,casual",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-3",
				new MessageRepositoryMock(),
				true, // ticket user explicitly hosting a casual room
			);
			expect(room.ranked).toBe(false);
		});

		it("exposes the ranked flag in the room list DTO", () => {
			const ranked = YGOProRoom.create(
				4,
				"TESTROOM",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-4",
				new MessageRepositoryMock(),
				true,
			);
			const casual = YGOProRoom.create(
				5,
				"casual",
				new LoggerMock(),
				new EventEmitter(),
				PlayerInfoMessageMother.create(),
				"sock-5",
				new MessageRepositoryMock(),
				true,
			);
			expect(ranked.toRoomListDTO().ranked).toBe(true);
			expect(casual.toRoomListDTO().ranked).toBe(false);
		});
	});

	describe("GX Format", () => {
		it("Should create a gx room with rule 5, duel_rule 1 and time limit 500", () => {
			const room = YGOProRoomMother.create({ command: "gx,tm500#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.duel_rule).toBe(1);
			expect(room.hostInfo.time_limit).toBe(500);
			expect(room.useExtendedCardPool).toBe(false);
		});
	});

	describe("Goat Format", () => {
		it("Should create a room with Goat format if command contains goat", () => {
			const room = YGOProRoomMother.create({ command: "goat#123" });
			expect(room.hostInfo.rule).toBe(5);
			expect(room.hostInfo.lflist).toBe(0);
			expect(room.hostInfo.time_limit).toBe(450);
			expect(room.hostInfo.duel_rule).toBe(4);
		});
	});

	describe("Mode Match Best of X", () => {
		it("Should create a room with Match mode Best of 3 if command contains bo0", () => {
			const room = YGOProRoomMother.create({ command: "bo0#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(3);
		});

		it("Should create a room with Single mode if command contains bo with a letter instead a number", () => {
			const room = YGOProRoomMother.create({ command: "boabc#123" });
			expect(room.hostInfo.mode).toBe(GameMode.SINGLE);
			expect(room.hostInfo.best_of).toBe(1);
		});

		it("Should create a room with Match mode Best of 3 if command contains bo3", () => {
			const room = YGOProRoomMother.create({ command: "bo3#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(3);
		});

		it("Should create a room with Match mode Best of 5 if command contains bo5", () => {
			const room = YGOProRoomMother.create({ command: "bo5#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(5);
		});

		it("Should create a room with Match mode Best of 7 if command contains bo7", () => {
			const room = YGOProRoomMother.create({ command: "bo7#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(7);
		});

		it("Should create a room with Match mode Best of 1 if command contains bo1", () => {
			const room = YGOProRoomMother.create({ command: "bo1#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(1);
		});

		it("Should create a room with Single mode if command not contains number", () => {
			const room = YGOProRoomMother.create({ command: "bo#123" });
			expect(room.hostInfo.mode).toBe(GameMode.SINGLE);
			expect(room.hostInfo.best_of).toBe(1);
		});

		it("Should create a room with Match mode Best of 3 if command contains bo2", () => {
			const room = YGOProRoomMother.create({ command: "bo2#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(3);
		});

		it("Should create a room with Match mode Best of 5 if command contains bo4", () => {
			const room = YGOProRoomMother.create({ command: "bo4#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(5);
		});

		it("Should create a room with Match mode Best of 7 if command contains bo6", () => {
			const room = YGOProRoomMother.create({ command: "bo6#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(7);
		});

		it("Should create a room with Match mode Best of 9 if command contains bo9", () => {
			const room = YGOProRoomMother.create({ command: "bo9#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(9);
		});

		it("Should create a room with Match mode Best of 3 if command contains m#123", () => {
			const room = YGOProRoomMother.create({ command: "m#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(3);
		});

		it("Should create a room with Match mode Best of 5 if command contains m,bo5#123", () => {
			const room = YGOProRoomMother.create({ command: "m,bo5#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(5);
		});

		it("Should create a room with Match mode Best of 5 if command contains bo5,m#123", () => {
			const room = YGOProRoomMother.create({ command: "bo5,m#123" });
			expect(room.hostInfo.mode).toBe(GameMode.MATCH);
			expect(room.hostInfo.best_of).toBe(5);
		});
	});

	// A ban-list hot-reload must NOT affect rooms already constructed. A room snapshots
	// its edopro ban-list hash as a primitive at construction, so a later replaceAll()
	// on the repositories cannot mutate an in-flight room's value.
	describe("ban-list hot-reload invariant", () => {
		// EdoproBanList derives its hash from added cards (no setHash); distinct cardIds
		// yield distinct hashes, which is what a real banlist edit produces.
		function makeEdoList(name: string, cardId: number): EdoproBanList {
			const list = new EdoproBanList();
			list.setName(name);
			list.add(cardId, 0); // a forbidden entry → deterministic non-zero hash
			return list;
		}

		afterEach(() => {
			YGOProBanListMemoryRepository.replaceAll([]);
			BanListMemoryRepository.replaceAll([]);
		});

		it("keeps a constructed room's edoBanListHash after the repositories are reloaded", () => {
			// Seed so the room resolves a concrete edopro hash at construction:
			// ygopro list at index 0 → its name → matching edopro list.
			const original = makeEdoList("Format A", 10000);
			const originalHash = original.hash;
			YGOProBanListMemoryRepository.replaceAll([createBanList("Format A", 111)]);
			BanListMemoryRepository.replaceAll([original]);

			const room = YGOProRoomMother.create({ command: "m#123" });
			expect(room.edoBanListHash).toBe(originalHash);

			// A hot-reload swaps in a same-named list with DIFFERENT content (different hash).
			const reloaded = makeEdoList("Format A", 20000);
			expect(reloaded.hash).not.toBe(originalHash); // sanity: edit changed the hash
			BanListMemoryRepository.replaceAll([reloaded]);

			// The already-constructed room keeps its snapshot; only the repo changed.
			expect(room.edoBanListHash).toBe(originalHash);
			expect(BanListMemoryRepository.findByName("Format A")?.hash).toBe(reloaded.hash);
		});
	});
});
