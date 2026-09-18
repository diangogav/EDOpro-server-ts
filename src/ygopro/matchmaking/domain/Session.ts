import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "@shared/socket/domain/ISocket";

export type MatchmakingQueueState = "idle" | "queued" | "matched";

export class AlreadyAuthenticatedError extends Error {
	constructor() {
		super("Session is already authenticated");
		this.name = "AlreadyAuthenticatedError";
	}
}

/**
 * Per-connection identity, auth state, queue state, and captured PLAYER_INFO
 * body. The sole writer of `ISocket.resolvedUserId` on the matchmaking path.
 */
export class Session {
	public queueState: MatchmakingQueueState = "idle";

	private authenticated = false;
	private resolvedDisplayName: string | null = null;
	private capturedPlayerInfoBody: Buffer | null = null;

	constructor(private readonly socket: ISocket) {}

	public authenticate(userId: string, displayName: string | null = null): void {
		if (this.authenticated) {
			throw new AlreadyAuthenticatedError();
		}

		this.socket.resolvedUserId = userId;
		this.resolvedDisplayName = displayName;
		this.authenticated = true;
	}

	public capturePlayerInfo(body: Buffer): void {
		this.capturedPlayerInfoBody = Buffer.from(body);
	}

	public get playerInfo(): PlayerInfoMessage | null {
		if (!this.capturedPlayerInfoBody) {
			return null;
		}

		return new PlayerInfoMessage(this.capturedPlayerInfoBody, this.capturedPlayerInfoBody.length);
	}

	public get isAuthenticated(): boolean {
		return this.authenticated;
	}

	public get displayName(): string | null {
		return this.resolvedDisplayName;
	}
}
