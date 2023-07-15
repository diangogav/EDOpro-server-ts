import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { ServerErrorClientMessage } from "../../messages/server-to-client/ServerErrorMessageClientMessage";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserFinder {
	constructor(private readonly userRepository: UserRepository) {}

	async run(playerInfo: PlayerInfoMessage): Promise<User | ServerErrorClientMessage> {
		const user = await this.userRepository.findBy(playerInfo.name);

		if (!user) {
			return ServerErrorClientMessage.create(
				"Usuario no encontrado, si quieres jugar en formato ranked debes registrarte en https://evolutionygo.com/"
			);
		}

		if (!playerInfo.password || !user.isValidPassword(playerInfo.password)) {
			return ServerErrorClientMessage.create("Contraseña incorrecta");
		}

		return user;
	}
}
