import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ServerErrorMessage } from "@edopro/messages/domain/ServerErrorMessage";
import { ServerErrorClientMessage } from "@edopro/messages/server-to-client/ServerErrorMessageClientMessage";

import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserFinder {
	constructor(private readonly userRepository: UserRepository) {}

	async run(playerInfo: PlayerInfoMessage): Promise<User | ServerErrorClientMessage> {
		const user = await this.userRepository.findBy(playerInfo.name);

		if (!user) {
			return ServerErrorClientMessage.create(ServerErrorMessage.USER_NOT_FOUND);
		}

		if (!playerInfo.password || !user.isValidPassword(playerInfo.password)) {
			return ServerErrorClientMessage.create(ServerErrorMessage.INVALID_PASSWORD);
		}

		return user;
	}
}
