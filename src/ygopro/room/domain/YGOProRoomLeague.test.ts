import EventEmitter from "events";

import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { RoomLeague } from "@shared/room/admission/domain/RoomLeague";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { PlayerInfoMessageMother } from "@test-support/mothers/PlayerInfoMessageMother";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { MessageRepositoryMock } from "@test-support/mocks/MessageRepositoryMock";

const noPin = PlayerInfoMessageMother.create(); // host name carries no ":pin"
const withPin = { name: "P", password: "1234" } as unknown as PlayerInfoMessage;

const create = (
	command: string,
	playerInfo: PlayerInfoMessage,
	rankedOverride?: boolean,
): YGOProRoom =>
	YGOProRoom.create(
		1,
		command,
		new LoggerMock(),
		new EventEmitter(),
		playerInfo,
		"socket-id",
		new MessageRepositoryMock(),
		rankedOverride,
	);

describe("YGOProRoom league", () => {
	it("a plain room (no PIN, no ticket) is Casual", () => {
		expect(create("ROOM", noPin).league).toBe(RoomLeague.Casual);
	});

	it("a PIN-hosted room is External", () => {
		expect(create("ROOM", withPin).league).toBe(RoomLeague.External);
	});

	it("a ticket-hosted room (rankedOverride) is Verified", () => {
		expect(create("ROOM", noPin, true).league).toBe(RoomLeague.Verified);
	});

	it("the explicit casual flag forces Casual even for a ticket host", () => {
		expect(create("ROOM,casual", noPin, true).league).toBe(RoomLeague.Casual);
	});

	it("derives `ranked` from the league (unchanged behavior)", () => {
		expect(create("ROOM", withPin).ranked).toBe(true);
		expect(create("ROOM", noPin).ranked).toBe(false);
		expect(create("ROOM", noPin, true).ranked).toBe(true);
	});
});
