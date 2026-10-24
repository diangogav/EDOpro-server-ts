import { AuthenticatePlayer } from "@edopro/room/application/AuthenticatePlayer";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "src/shared/socket/domain/ISocket";

import { UserAuth } from "@shared/user-auth/application/UserAuth";

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
		const user = await new AuthenticatePlayer(this.userAuth).run(playerInfo, socket);

		return user !== null;
	}
}
