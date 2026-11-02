import { EventEmitter } from "stream";

import { MatchContext } from "@shared/room/domain/lifecycle/MatchLifecycleHook";
import { RoomState } from "@shared/room/domain/RoomState";
import { YgoRoom } from "@shared/room/domain/YgoRoom";

import { registerRoomStatePorts } from "./roomStatePorts";

jest.mock("@shared/dependency-injection");
jest.mock("src/web-socket-server/WebSocketSingleton");

import { container } from "@shared/dependency-injection";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

class ProbeRoomState extends RoomState {
	protected relayChat(): void {
		// Chat is not under test here.
	}

	runStarted(ctx: MatchContext): void {
		this.matchLifecycle.runStarted(ctx);
	}

	runEnding(ctx: MatchContext): Promise<void> {
		return this.matchLifecycle.runEnding(ctx);
	}

	broadcastUpdate(room: YgoRoom): void {
		this.broadcastDuelRoomUpdate(room);
	}
}

describe("registerRoomStatePorts", () => {
	const hooks = { runStarted: jest.fn(), runEnding: jest.fn().mockResolvedValue(undefined) };
	const broadcast = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		(container.get as jest.Mock).mockReturnValue(hooks);
		(WebSocketSingleton.getInstance as jest.Mock).mockReturnValue({ broadcast });
		registerRoomStatePorts();
	});

	it("runs the match start and end hooks from the DI container", async () => {
		const state = new ProbeRoomState(new EventEmitter());
		const ctx = { matchId: "m-1" } as unknown as MatchContext;

		state.runStarted(ctx);
		await state.runEnding(ctx);

		expect(hooks.runStarted).toHaveBeenCalledWith(ctx);
		expect(hooks.runEnding).toHaveBeenCalledWith(ctx);
	});

	it("broadcasts room updates through the room-list WebSocket", () => {
		const state = new ProbeRoomState(new EventEmitter());
		const room = { toRealTimePresentation: () => ({ id: 7 }) } as unknown as YgoRoom;

		state.broadcastUpdate(room);

		expect(broadcast).toHaveBeenCalledWith({ action: "UPDATE-ROOM", data: { id: 7 } });
	});

	it("resolves the hooks on each call, so hooks registered after boot are reached", () => {
		const later = { runStarted: jest.fn(), runEnding: jest.fn() };
		const state = new ProbeRoomState(new EventEmitter());
		(container.get as jest.Mock).mockReturnValue(later);

		state.runStarted({ matchId: "m-2" } as unknown as MatchContext);

		expect(later.runStarted).toHaveBeenCalled();
		expect(hooks.runStarted).not.toHaveBeenCalled();
	});
});
