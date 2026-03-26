import { config } from "src/config";
import { ServerMessageClientMessage } from "src/edopro/messages/server-to-client/ServerMessageClientMessage";
import { MercuryPlayerChatMessage } from "src/mercury/messages/server-to-client/MercuryPlayerChatMessage";
import { ISocket } from "src/shared/socket/domain/ISocket";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { PlayerStatsPostgresRepository } from "../infrastructure/PlayerStatsPostgresRepository";

type WelcomeMessageTransport = "system" | "mercury-chat";

export async function sendGlobalPointsWelcomeMessage(
	socket: ISocket,
	username: string,
	userId?: string | null,
	transport: WelcomeMessageTransport = "system"
): Promise<void> {
	const resolvedUserId =
		userId ?? (await new UserProfilePostgresRepository().findByUsername(username))?.id ?? null;

	if (!resolvedUserId) {
		return;
	}

	const repository = new PlayerStatsPostgresRepository();
	const globalStats = await repository.findByUserIdAndBanListName(resolvedUserId, "Global");
	const rankPosition = await repository.findGlobalRankPositionByUserId(resolvedUserId);
	const gamesPlayed = globalStats.wins + globalStats.losses;
	const winRate =
		gamesPlayed === 0 ? 0 : Number(((globalStats.wins / gamesPlayed) * 100).toFixed(2));
	const topBanLists = await repository.findTopBanListsByUserId(
		resolvedUserId,
		3
	);

	const sendMessage = (message: string) => {
		if (transport === "mercury-chat") {
			socket.send(MercuryPlayerChatMessage.create(message));

			return;
		}

		socket.send(ServerMessageClientMessage.create(message));
	};

	sendMessage(`Player: ${username} | Season ${config.season}`);
	sendMessage(`Ranking: #${rankPosition}`);
	sendMessage(`Win Rate: ${winRate}%`);
	sendMessage(`Games Played: ${gamesPlayed}`);
	sendMessage("Top Banlists:");

	if (topBanLists.length === 0) {
		sendMessage("No banlists with points yet.");

		return;
	}

	topBanLists.forEach((item, index) => {
		sendMessage(`${index + 1}. ${item.banListName}: ${item.points} points`);
	});
}
