import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { PlayerCredential } from "@shared/room/admission/domain/PlayerCredential";
import { ISocket } from "@shared/socket/domain/ISocket";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";

/**
 * Turns "how the client connected" into a single PlayerCredential, in ONE pass.
 *
 * This is what kills the historical double-auth: identity is resolved here once
 * and handed to the admission policy as a value — nobody re-validates downstream.
 *
 * Strength order, strongest first:
 *   1. handshake ticket (socket.resolvedUserId) → verified
 *   2. legacy PIN in the nickname               → external
 *   3. neither / invalid                        → guest
 *
 * An invalid/banned ticket or a wrong PIN does NOT reject here — it degrades to
 * `guest`. Whether a guest is allowed in is the admission policy's call, not
 * the resolver's (single responsibility).
 */
export class CredentialResolver {
	constructor(
		private readonly userProfileRepository: UserProfileRepository,
		private readonly userAuth: UserAuth,
	) {}

	async resolve(socket: ISocket, playerInfo: PlayerInfoMessage): Promise<PlayerCredential> {
		if (socket.resolvedUserId) {
			const profile = await this.userProfileRepository.findById(socket.resolvedUserId);
			if (profile && !(await this.userProfileRepository.isBanned(profile.id))) {
				return { kind: "verified", userId: profile.id };
			}
			return { kind: "guest", name: playerInfo.name };
		}

		if (playerInfo.password) {
			const user = await this.userAuth.run(playerInfo);
			if (user instanceof UserProfile) {
				return { kind: "external", userId: user.id };
			}
		}

		return { kind: "guest", name: playerInfo.name };
	}
}
