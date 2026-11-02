import { container } from "@shared/dependency-injection";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";
import { RoomState } from "@shared/room/domain/RoomState";
import WebSocketSingleton from "src/web-socket-server/WebSocketSingleton";

/**
 * Wires the collaborators every room state shares. Both adapters resolve
 * their target on each call, as the states used to, so a hook registered
 * later or a WebSocket server started later is still reached.
 */
export function registerRoomStatePorts(): void {
	RoomState.usePorts({
		lifecycle: {
			runStarted: (ctx) => container.get(MatchLifecycleHooks).runStarted(ctx),
			runEnding: (ctx) => container.get(MatchLifecycleHooks).runEnding(ctx),
		},
		roomList: {
			broadcast: (message) => WebSocketSingleton.getInstance().broadcast(message),
		},
	});
}
