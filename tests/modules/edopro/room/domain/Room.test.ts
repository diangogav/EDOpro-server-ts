import EventEmitter from "events";

import { CreateGameMessage } from "../../../../../src/edopro/messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../../../../src/edopro/messages/client-to-server/PlayerInfoMessage";
import { Room } from "../../../../../src/edopro/room/domain/Room";
import { LoggerMock } from "../../../mocks/logger/LoggerMock";

describe("Room", () => {
	it("should mark rooms created with nick only as Edopro", () => {
		const room = Room.createFromCreateGameMessage(
			createGameMessageStub(),
			new PlayerInfoMessage(Buffer.from("Jaden", "utf16le"), Buffer.from("Jaden", "utf16le").length),
			1,
			new EventEmitter(),
			new LoggerMock()
		);

		expect(room.notes).toBe("(Edopro) Test notes - SD Max: 15");
	});

	it("should mark rooms created with user and password as Edopro-Ranked", () => {
		const room = Room.createFromCreateGameMessage(
			createGameMessageStub(),
			new PlayerInfoMessage(
				Buffer.from("Jaden:1234", "utf16le"),
				Buffer.from("Jaden:1234", "utf16le").length
			),
			1,
			new EventEmitter(),
			new LoggerMock()
		);

		expect(room.notes).toBe("(Edopro-Ranked) Test notes - SD Max: 15");
	});
});

function createGameMessageStub(): CreateGameMessage {
	return {
		banList: 0,
		allowed: 0,
		mode: 0,
		duelRule: 0,
		dontCheckDeckContent: 0,
		dontShuffleDeck: 0,
		offset: 0,
		lp: 8000,
		startingHandCount: 5,
		drawCount: 1,
		timeLimit: 180,
		duelFlagsHight: 0,
		handshake: 0,
		clientVersion: 0,
		t0Count: 1,
		t1Count: 1,
		bestOf: 1,
		duelFlagsLow: 0,
		forbidden: 0,
		extraRules: 0,
		mainDeckMin: 40,
		mainDeckMax: 60,
		extraDeckMin: 0,
		extraDeckMax: 15,
		sideDeckMin: 0,
		sideDeckMax: 15,
		name: "Test room",
		password: "",
		notes: "Test notes",
	} as CreateGameMessage;
}
