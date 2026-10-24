import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Room } from "@edopro/room/domain/Room";
import RoomList from "@edopro/room/infrastructure/RoomList";
import { Rule } from "@shared/deck/domain/Rule";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { RoomCreator } from "./RoomCreator";

jest.mock("@edopro/ban-list/infrastructure/BanListMemoryRepository");
jest.mock("@edopro/room/infrastructure/RoomList");

function createdRoom(rule?: number): Room {
	new RoomCreator(new LoggerMock()).create({ name: "room", banlist: "TCG", rule } as never);

	return (RoomList.addRoom as jest.Mock).mock.calls[0][0] as Room;
}

describe("RoomCreator", () => {
	beforeEach(() => {
		(BanListMemoryRepository.findByName as jest.Mock).mockReturnValue(new EdoproBanList());
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("keeps an OCG-only rule instead of widening it to anything goes", () => {
		expect(createdRoom(Rule.ONLY_OCG).toPresentation().rule).toBe(Rule.ONLY_OCG);
	});

	it("keeps the requested rule", () => {
		expect(createdRoom(Rule.ONLY_TCG).toPresentation().rule).toBe(Rule.ONLY_TCG);
	});

	it("defaults to anything goes when no rule is requested", () => {
		expect(createdRoom().toPresentation().rule).toBe(Rule.ALL);
	});
});
