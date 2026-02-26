import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ServerErrorMessage } from "@edopro/messages/domain/ServerErrorMessage";
import { ServerErrorClientMessage } from "@edopro/messages/server-to-client/ServerErrorMessageClientMessage";

import { UserProfile } from "../../user-profile/domain/UserProfile";
import { UserProfileRepository } from "../../user-profile/domain/UserProfileRepository";

export class UserAuth {
  constructor(private readonly userProfileRepository: UserProfileRepository) {}

  async run(
    playerInfo: PlayerInfoMessage,
  ): Promise<UserProfile | ServerErrorClientMessage> {
    const userProfile = await this.userProfileRepository.findByUsername(
      playerInfo.name,
    );

    if (!userProfile) {
      return ServerErrorClientMessage.create(ServerErrorMessage.USER_NOT_FOUND);
    }

    const isBanned = await this.userProfileRepository.isBanned(userProfile.id);
    if (isBanned) {
      return ServerErrorClientMessage.create(ServerErrorMessage.USER_BANNED);
    }

    if (
      !playerInfo.password ||
      !(await userProfile.isValidPassword(playerInfo.password))
    ) {
      return ServerErrorClientMessage.create(
        ServerErrorMessage.INVALID_PASSWORD,
      );
    }

    return userProfile;
  }
}
