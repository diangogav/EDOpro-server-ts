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
	send(message: Buffer): void;
	onMessage(callback: (message: Buffer) => void): void;
	onClose(callback: () => void): void;
	close(): void;
	destroy(): void;
	remoteAddress: string | undefined;
	closed: boolean;
	removeAllListeners(): void;
}
