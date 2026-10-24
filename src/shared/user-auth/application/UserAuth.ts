import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ServerErrorMessage } from "@shared/user-auth/domain/ServerErrorMessage";

import { UserProfile } from "../../user-profile/domain/UserProfile";
import { UserProfileRepository } from "../../user-profile/domain/UserProfileRepository";

export class UserAuth {
	constructor(private readonly userProfileRepository: UserProfileRepository) {}

	async run(playerInfo: PlayerInfoMessage): Promise<UserProfile | ServerErrorMessage> {
		const userProfile = await this.userProfileRepository.findByUsername(playerInfo.name);

		if (!userProfile) {
			return ServerErrorMessage.USER_NOT_FOUND;
		}

		const isBanned = await this.userProfileRepository.isBanned(userProfile.id);
		if (isBanned) {
			return ServerErrorMessage.USER_BANNED;
		}

		if (!playerInfo.password || !(await userProfile.isValidPassword(playerInfo.password))) {
			return ServerErrorMessage.INVALID_PASSWORD;
		}

		return userProfile;
	}
}
