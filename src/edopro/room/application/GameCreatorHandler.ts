import { AuthenticatePlayer } from "@edopro/room/application/AuthenticatePlayer";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { VerifyAccount } from "@shared/user-profile/application/VerifyAccount";
import {
	RANKED_REQUIRES_VERIFIED_ACCOUNT_MESSAGE,
	rankedRefusesAccount,
} from "@shared/user-profile/domain/VerifiedAccount";
import { EventEmitter } from "stream";
import { ChatColor } from "ygopro-msg-encode";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "../../../shared/room/domain/GameCreatorMessageHandler";
import { roomCreationNotice } from "../../../shared/room/domain/chat/RoomCreationNotice";
import { createSystemChat } from "../../../shared/room/domain/chat/SystemChat";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "@shared/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../shared/messages/Commands";
import { ClientMessage } from "../../../shared/messages/MessageProcessor";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { createEdoproRoomDeps } from "./createEdoproRoomDeps";
import { generateUnusedRoomId } from "./generateUnusedRoomId";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreatorHandler implements GameCreatorMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly userAuth: UserAuth;
	private readonly verifyAccount: VerifyAccount;
	private isCreating = false;

	constructor(eventEmitter: EventEmitter, logger: Logger, socket: ISocket, userAuth: UserAuth) {
		this.eventEmitter = eventEmitter;
		this.logger = logger.child({ file: "GameCreatorHandler" });
		this.socket = socket;
		this.userAuth = userAuth;
		this.verifyAccount = new VerifyAccount(userAuth, config.verifiedAccount.cutoff, this.logger);
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handleCreateGame(message);
		});
	}

	async handleCreateGame(message: ClientMessage): Promise<void> {
		this.logger.info("Handle");

		// A connection hosts at most one room; the flag covers frames that arrive while the
		// first room is still being created and socket.roomId is not set yet.
		if (this.socket.roomId !== undefined || this.isCreating) {
			this.logger.info("CREATE_GAME ignored, the connection already has a room", {
				roomId: this.socket.roomId,
			});

			return;
		}

		this.isCreating = true;
		try {
			await this.createFromMessage(message);
		} finally {
			this.isCreating = false;
		}
	}

	private async createFromMessage(message: ClientMessage): Promise<void> {
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const createGameMessage = new CreateGameMessage(message.data);

		if (!playerInfoMessage.password || !config.ranking.enabled) {
			await this.create(createGameMessage, playerInfoMessage, null);

			return;
		}

		const user = await new AuthenticatePlayer(this.userAuth).run(playerInfoMessage, this.socket);
		if (!user) {
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			return;
		}

		if (
			rankedRefusesAccount(user, {
				required: config.verifiedAccount.rankedRequired,
				cutoff: config.verifiedAccount.cutoff,
			})
		) {
			this.socket.send(createSystemChat(ChatColor.RED, RANKED_REQUIRES_VERIFIED_ACCOUNT_MESSAGE));
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			return;
		}

		await this.create(createGameMessage, playerInfoMessage, user.id);
	}

	private async create(
		message: CreateGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		userId: string | null,
	): Promise<void> {
		const room = Room.createFromCreateGameMessage(
			message,
			playerInfoMessage,
			generateUnusedRoomId(),
			this.eventEmitter,
			this.logger,
			createEdoproRoomDeps(),
		);

		room.waiting();

		const host = await room.createPlayer(this.socket, playerInfoMessage.name, userId);
		if (host?.host) {
			// Not awaited: the room opens at once and the answer arrives later.
			host.setAccountVerification(
				this.verifyAccount.verify({
					userId: userId ?? this.socket.resolvedUserId ?? null,
					playerInfo: playerInfoMessage,
				}),
			);
			host.sendMessage(CreateGameClientMessage.create(room));
			host.sendMessage(JoinGameClientMessage.createFromCreateGameMessage(message));
			room.addPlayer(host);
			RoomList.addRoom(room);
		}

		this.sendRoomCreationNotice(room);
	}

	/**
	 * One-line, colored room-creation notice replacing the old three-clause
	 * WELCOME banner.
	 */
	private sendRoomCreationNotice(room: Room): void {
		this.socket.send(
			roomCreationNotice({ ranked: room.ranked, rankingEnabled: config.ranking.enabled }),
		);
	}
}
