import { PlayerInfoMessage } from "../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";

/**
 * Upper bound on the mid-duel identity resolution. The resolve runs INSIDE the
 * room's exclusive section, so a database connection that never settles would
 * otherwise hold the room mutex forever and freeze every later join. Long
 * enough for a slow-but-alive database round trip; short enough that a stuck
 * room recovers within one reconnect attempt.
 */
export const JOINER_IDENTITY_RESOLVE_TIMEOUT_MS = 5000;

/** The seam every non-waiting state resolves a joiner's identity through. */
interface JoinerIdentityResolver {
	resolveJoinerIdentity(socket: ISocket, playerInfo: PlayerInfoMessage): Promise<string | null>;
}

/**
 * Resolves a mid-duel joiner's identity with a bounded wait. A resolver that
 * hangs (never settles) rejects at the timeout, funneling into the caller's
 * existing fail-closed catch — the same outcome as a resolver error: the
 * joiner spectates, the seat stays untouched, and the mutex releases. The
 * shared entry point for the four non-waiting states, so the bound lives in
 * one place.
 */
export async function resolveJoinerIdentityWithTimeout(
	room: JoinerIdentityResolver,
	socket: ISocket,
	playerInfo: PlayerInfoMessage,
	timeoutMs: number = JOINER_IDENTITY_RESOLVE_TIMEOUT_MS,
): Promise<string | null> {
	let timer: NodeJS.Timeout | undefined;
	const resolution = room.resolveJoinerIdentity(socket, playerInfo);
	// A resolver that loses the race may still reject later (a hung connection
	// eventually erroring); that late failure is already handled here and must
	// not surface as an unhandled rejection.
	resolution.catch(() => undefined);
	try {
		return await Promise.race([
			resolution,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`identity resolution timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
