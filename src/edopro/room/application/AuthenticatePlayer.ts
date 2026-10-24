import { ServerErrorClientMessage } from "@edopro/messages/server-to-client/ServerErrorMessageClientMessage";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "@shared/socket/domain/ISocket";
import { UserAuth } from "@shared/user-auth/application/UserAuth";
import { UserProfile } from "@shared/user-profile/domain/UserProfile";

/**
 * EDOPro side of UserAuth: on failure it sends the auth error to the socket as
 * the EDOPro 0xF3 server error frame and returns null. The JOINERROR that
 * usually follows stays with each caller.
 */
export class AuthenticatePlayer {
	constructor(private readonly userAuth: UserAuth) {}

	async run(playerInfo: PlayerInfoMessage, socket: ISocket): Promise<UserProfile | null> {
		const user = await this.userAuth.run(playerInfo);
		if (!(user instanceof UserProfile)) {
			socket.send(ServerErrorClientMessage.create(user));

			return null;
		}

		return user;
	}
}
