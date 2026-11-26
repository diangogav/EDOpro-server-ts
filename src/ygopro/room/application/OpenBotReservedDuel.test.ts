jest.mock("../../../web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));
jest.mock("@shared/dependency-injection", () => ({
	container: { get: () => ({ runClosed: jest.fn() }) },
}));
jest.mock("@ygopro/SimpleRoomMessageEmitter");

import { ReservedDuelServices } from "@shared/reserved-duel/application/ReservedDuels";
import { Reservation } from "@shared/reserved-duel/domain/Reservation";
import { ClaimResult } from "@shared/reserved-duel/domain/ReservationStore";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { WindbotModule } from "../../windbot/application/WindbotModule";
import YGOProRoomList from "../infrastructure/YGOProRoomList";
import { OpenBotReservedDuel } from "./OpenBotReservedDuel";
import { ReservedDuelLobbyTimeout } from "./ReservedDuelLobbyTimeout";

const ID = "Ab3dEf6hIj9kLm2n";

const reservation = (overrides: Partial<Reservation> = {}): Reservation => ({
	id: ID,
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "windbot", botName: "Blackwing" },
		{ seat: 1, kind: "windbot", botName: "Lightsworn" },
	],
	options: {
		spectators: true,
		listed: false,
		reconnect: true,
		deckLock: "registered",
		lobbyTimeoutSeconds: 90,
	},
	...overrides,
});

const makeServices = (claim: ClaimResult) => {
	const services = {
		store: {
			claim: jest.fn(),
			claimForServer: jest.fn().mockResolvedValue(claim),
			release: jest.fn(),
		},
		repository: {
			open: jest.fn().mockResolvedValue(undefined),
			exists: jest.fn().mockResolvedValue(false),
		},
		instanceId: "instance-a",
		started: jest.fn(),
		abandoned: jest.fn(),
		release: jest.fn(),
	};
	return services;
};

const makeWindbot = (enabled = true, request = jest.fn().mockResolvedValue({})) =>
	({ isEnabled: () => enabled, requestBot: request }) as unknown as WindbotModule;

const flush = () => new Promise((resolve) => setImmediate(resolve));

const open = (services: ReturnType<typeof makeServices>, windbot = makeWindbot()) =>
	new OpenBotReservedDuel(
		() => services as unknown as ReservedDuelServices,
		windbot,
		new LoggerMock(),
	).run(ID);

beforeEach(() => {
	jest.spyOn(ReservedDuelLobbyTimeout, "schedule").mockReturnValue(null);
});

afterEach(() => {
	jest.restoreAllMocks();
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
});

describe("OpenBotReservedDuel", () => {
	it("claims the duel, records it with no seat joined and requests each bot for its seat", async () => {
		const services = makeServices({ status: "claimed", reservation: reservation() });
		const request = jest.fn().mockResolvedValue({});

		await open(services, makeWindbot(true, request));

		expect(services.store.claimForServer).toHaveBeenCalledWith(ID, "instance-a");
		const [room] = YGOProRoomList.getRooms();
		expect(room.reservedDuel?.id).toBe(ID);
		expect(room.noReconnect).toBe(true);
		expect(services.repository.open).toHaveBeenCalledWith({
			reservation: reservation(),
			instanceId: "instance-a",
			roomId: room.id,
			joinedSeat: -1,
		});
		expect(ReservedDuelLobbyTimeout.schedule).toHaveBeenCalledWith(room);
		expect(request.mock.calls.map((call) => [call[1], call[5]])).toEqual([
			["Blackwing", 0],
			["Lightsworn", 1],
		]);
	});

	it.each<ClaimResult>([
		{ status: "claimed_elsewhere" },
		{ status: "not_participant" },
		{ status: "missing" },
		{ status: "already_claimed_here", reservation: reservation() },
	])("opens nothing when the claim answers $status", async (claim) => {
		const services = makeServices(claim);

		await open(services);

		expect(YGOProRoomList.getRooms()).toHaveLength(0);
		expect(services.repository.open).not.toHaveBeenCalled();
	});

	it("ends the room as bot_unavailable when WindBot is off", async () => {
		const services = makeServices({ status: "claimed", reservation: reservation() });

		await open(services, makeWindbot(false));

		expect(services.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "bot_unavailable" });
		expect(YGOProRoomList.getRooms()).toHaveLength(0);
	});

	it("ends the room as bot_unavailable when a bot request fails", async () => {
		const services = makeServices({ status: "claimed", reservation: reservation() });
		const request = jest
			.fn()
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("unreachable"));

		await open(services, makeWindbot(true, request));
		await flush();

		expect(services.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "bot_unavailable" });
	});

	it("closes the duel unplayed when its format is unknown", async () => {
		const services = makeServices({
			status: "claimed",
			reservation: reservation({ format: "nonsense" }),
		});

		await open(services);
		await flush();

		expect(YGOProRoomList.getRooms()).toHaveLength(0);
		expect(services.repository.open).toHaveBeenCalledWith(
			expect.objectContaining({ roomId: 0, joinedSeat: -1 }),
		);
		expect(services.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "room_closed" });
	});

	it("closes the room when its row cannot be written", async () => {
		const services = makeServices({ status: "claimed", reservation: reservation() });
		services.repository.open.mockRejectedValue(new Error("db down"));

		await open(services);

		expect(YGOProRoomList.getRooms()).toHaveLength(0);
		expect(services.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "room_closed" });
	});
});
