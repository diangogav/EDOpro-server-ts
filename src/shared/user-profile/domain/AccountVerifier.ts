import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";

/**
 * What the server knows about a joining client before it is admitted: the
 * account the connection already proved (a handshake ticket or a resolved
 * credential) and the PIN typed in the name field.
 */
export type AccountVerificationInput = {
	userId: string | null;
	playerInfo: PlayerInfoMessage | null;
};

/**
 * Tells whether the account behind a joining client is verified. It resolves
 * false for guests, unknown or banned accounts and on any failure, and never
 * rejects, so callers can start it without awaiting it.
 */
export interface AccountVerifier {
	verify(input: AccountVerificationInput): Promise<boolean>;
}
