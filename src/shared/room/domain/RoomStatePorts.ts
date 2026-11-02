import { MatchContext } from "./lifecycle/MatchLifecycleHook";

/** The match lifecycle hooks room states run (MatchLifecycleHooks). */
export interface MatchLifecycle {
	runStarted(ctx: MatchContext): void;
	runEnding(ctx: MatchContext): Promise<void>;
}

/** Pushes room changes to the room-list WebSocket clients (WebSocketSingleton). */
export interface RoomListBroadcaster {
	broadcast(message: { action: string; data: { [key: string]: unknown } }): void;
}

/**
 * Collaborators every room state of both engines shares. Boot registers the
 * production adapters once (registerRoomStatePorts in src/bootstrap).
 */
export interface RoomStatePorts {
	lifecycle: MatchLifecycle;
	roomList: RoomListBroadcaster;
}
