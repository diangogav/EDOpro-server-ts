import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";
import { UserProfileRepository } from "@shared/user-profile/domain/UserProfileRepository";
import { ISocket } from "@shared/socket/domain/ISocket";

export class RankedUserResolver {
  constructor(
    private readonly userAuth: UserAuth,
    private readonly repo: UserProfileRepository,
  ) {}

  async resolve(info: PlayerInfoMessage, socket: ISocket): Promise<string | null> {
    if (socket.resolvedUserId) {
      const profile = await this.repo.findById(socket.resolvedUserId);
      if (!profile) {
        return null;
      }
      const banned = await this.repo.isBanned(profile.id);
      if (banned) {
        return null;
      }

      return profile.id;
    }

    const user = await this.userAuth.run(info);

    return user instanceof UserProfile ? user.id : null;
  }
}
