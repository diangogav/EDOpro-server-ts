import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "src/shared/socket/domain/ISocket";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";

import { UserAuth } from "./UserAuth";

export class CheckIfUseCanJoin {
	constructor(private readonly userAuth: UserAuth) {}

	/**
	 * Validates the player against the user store. On failure it sends the auth
	 * detail (ServerErrorMessage, which the web client ignores) and returns false,
	 * but it does NOT send the STOC_ERROR_MSG/JOINERROR itself: that frame's wire
	 * format is client-specific. ygopro/web callers must serialize it through the
	 * ygopro repository (8-byte body, code at offset 4); edopro callers use
	 * ErrorClientMessage. Each caller sends the JOINERROR in its own format after a
	 * false result, so the web client no longer receives the 5-byte @edopro frame
	 * it cannot decode.
	 */
	async check(playerInfo: PlayerInfoMessage, socket: ISocket): Promise<boolean> {
		const user = await this.userAuth.run(playerInfo);
		if (!(user instanceof UserProfile)) {
			socket.send(user as Buffer);

			return false;
		}

		return true;
	}
}
