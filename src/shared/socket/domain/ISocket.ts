export interface ISocket {
	id?: string;
	roomId?: number;
	resolvedUserId?: string;
	/** Set on a server-driven bot connection whose one-shot, room-bound join
	 * token was already consumed and validated — such a socket carries no user
	 * identity but is pre-authorized for EXACTLY the room the token named.
	 * Holds that room's id so the authorization cannot leak to another room
	 * over the socket's lifetime. */
	internalForRoomId?: number;
	/** Set ONLY by WatchJoinStrategy when the parsed join command was a watch
	 * request ("w,<roomId>"): this joiner asked to spectate, never to take a
	 * seat — in every room state. Derived exclusively from the command string
	 * the server parsed — no client-controlled field can set it — and scoped
	 * to that one room's id. Read only by seat-offer/seat-taking decisions:
	 * the waiting admission's freeSeat guard and the mid-duel states'
	 * spectate-forcing (findMidDuelReconnectingPlayer). Every other gate
	 * (reservation, ranked, league) still applies. Never cleared, so a stale
	 * stamp for room A must never affect any other room — readers must always
	 * compare it against their own room id. */
	watchForRoomId?: number;
	send(message: Buffer): void;
	onMessage(callback: (message: Buffer) => void): void;
	onClose(callback: () => void): void;
	close(): void;
	destroy(): void;
	/**
	 * Closes after everything already queued for sending has flushed, then falls
	 * back to a hard destroy if the peer has not closed within `timeoutMs`.
	 * Detaches message/close listeners first (like `destroy()`), so the close
	 * never re-enters disconnect handling. `closed` reads true from this call on.
	 */
	closeGracefully(timeoutMs: number): void;
	remoteAddress: string | undefined;
	closed: boolean;
	removeAllListeners(): void;
}
