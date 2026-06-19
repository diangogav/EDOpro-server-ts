import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { Logger } from "@shared/logger/domain/Logger";
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
		private readonly logger?: Logger,
	) {}

	async resolve(socket: ISocket, playerInfo: PlayerInfoMessage): Promise<PlayerCredential> {
		if (socket.resolvedUserId) {
			const profile = await this.userProfileRepository.findById(socket.resolvedUserId);
			if (profile && !(await this.userProfileRepository.isBanned(profile.id))) {
				this.logger?.debug(
					`admission/credential: resolved=verified name="${playerInfo.name}" userId=${profile.id}`,
				);
				return { kind: "verified", userId: profile.id };
			}
			this.logger?.debug(
				`admission/credential: ticket present but invalid/banned, degrading to guest name="${playerInfo.name}"`,
			);
			return { kind: "guest", name: playerInfo.name };
		}

		if (playerInfo.password) {
			const user = await this.userAuth.run(playerInfo);
			if (user instanceof UserProfile) {
				this.logger?.debug(
					`admission/credential: resolved=external name="${playerInfo.name}" userId=${user.id}`,
				);
				return { kind: "external", userId: user.id };
			}
			// PIN was present but UserAuth did NOT return a profile (user-not-found,
			// banned, or invalid PIN). Identity degrades to guest — which a ranked
			// room then rejects. This log pinpoints the PIN as the failure point.
			this.logger?.debug(
				`admission/credential: PIN present but auth FAILED → degrading to guest name="${playerInfo.name}"`,
			);
			return { kind: "guest", name: playerInfo.name };
		}

		this.logger?.debug(
			`admission/credential: resolved=guest (no ticket, no PIN) name="${playerInfo.name}"`,
		);
		return { kind: "guest", name: playerInfo.name };
	}
}
