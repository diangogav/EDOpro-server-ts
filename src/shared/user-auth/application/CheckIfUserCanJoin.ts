import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "@edopro/messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "@edopro/messages/server-to-client/ErrorClientMessage";
import { ISocket } from "src/shared/socket/domain/ISocket";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";

import { UserAuth } from "./UserAuth";

export class CheckIfUseCanJoin {
	constructor(private readonly userAuth: UserAuth) {}

	async check(playerInfo: PlayerInfoMessage, socket: ISocket): Promise<boolean> {
		const user = await this.userAuth.run(playerInfo);
		if (!(user instanceof UserProfile)) {
			socket.send(user as Buffer);
			socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			return false;
		}

		return true;
	}
}
