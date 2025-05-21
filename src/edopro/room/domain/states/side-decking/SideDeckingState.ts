/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "events";

import { Logger } from "../../../../../shared/logger/domain/Logger";
import { DuelStartClientMessage } from "../../../../../shared/messages/server-to-client/DuelStartClientMessage";
import { ISocket } from "../../../../../shared/socket/domain/ISocket";
import { Client } from "../../../../client/domain/Client";
import { DeckCreator } from "../../../../deck/application/DeckCreator";
import { UpdateDeckMessageSizeCalculator } from "../../../../deck/application/UpdateDeckMessageSizeCalculator";
import { JoinGameMessage } from "../../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../messages/domain/Commands";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { ChooseOrderClientMessage } from "../../../../messages/server-to-client/ChooseOrderClientMessage";
import { ErrorMessages } from "../../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../../messages/server-to-client/ErrorClientMessage";
import { SideDeckClientMessage } from "../../../../messages/server-to-client/game-messages/SideDeckClientMessage";
import { FinishDuelHandler } from "../../../application/FinishDuelHandler";
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { DuelFinishReason } from "../../DuelFinishReason";
import { Room } from "../../Room";
import { RoomState } from "../../RoomState";
import { Timer } from "../../Timer";

export class SideDeckingState extends RoomState {
	private sideDeckingTimer: Timer | null = null;
	private sideDeckingWarningTimeout: ReturnType<typeof setTimeout> | null = null;
	private readonly sideDeckingTimeoutMs = 60000; // 60 seconds, adjust as needed
	private readonly sideDeckingWarningMs = 5000; // Warn 5 seconds before timeout
	private sideDeckingTimerTeam: number | null = null;

	constructor(
		eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly reconnect: Reconnect,
		private readonly joinToDuelAsSpectator: JoinToDuelAsSpectator,
		private readonly deckCreator: DeckCreator
	) {
		super(eventEmitter);

		this.eventEmitter.on(
			Commands.UPDATE_DECK as unknown as string,
			(message: ClientMessage, room: Room, client: Client) =>
				void this.handleUpdateDeck.bind(this)(message, room, client)
		);

		this.eventEmitter.on(
			"JOIN" as unknown as string,
			(message: ClientMessage, room: Room, socket: ISocket) =>
				this.handle.bind(this)(message, room, socket)
		);
	}

	async handle(message: ClientMessage, room: Room, socket: ISocket): Promise<void> {
		this.logger.debug("SIDE_DECKING: JOIN");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new JoinGameMessage(message.data);
		const reconnectingPlayer = this.playerAlreadyInRoom(playerInfoMessage, room, socket);

		if (!(reconnectingPlayer instanceof Client)) {
			this.joinToDuelAsSpectator.run(joinMessage, playerInfoMessage, socket, room);

			return;
		}

		await this.reconnect.run(playerInfoMessage, reconnectingPlayer, joinMessage, socket, room);
	}

	private async handleUpdateDeck(
		message: ClientMessage,
		room: Room,
		player: Client
	): Promise<void> {
		this.logger.debug("SIDE_DECKING: UPDATE_DECK");
		const messageSize = new UpdateDeckMessageSizeCalculator(message.data).calculate();
		const body = message.data.subarray(0, messageSize);
		const mainAndExtraDeckSize = body.readUInt32LE(0);
		const sizeDeckSize = body.readUint32LE(4);
		const mainDeck: number[] = [];
		for (let i = 8; i < mainAndExtraDeckSize * 4 + 8; i += 4) {
			const code = body.readUint32LE(i);
			mainDeck.push(code);
		}

		const sideDeck: number[] = [];
		for (
			let i = mainAndExtraDeckSize * 4 + 8;
			i < (mainAndExtraDeckSize + sizeDeckSize) * 4 + 8;
			i += 4
		) {
			const code = body.readUint32LE(i);
			sideDeck.push(code);
		}

		if (!player.deck.isSideDeckValid(mainDeck)) {
			const message = ErrorClientMessage.create(ErrorMessages.SIDE_ERROR);
			player.sendMessage(message);

			return;
		}

		const deck = await this.deckCreator.build({
			main: mainDeck,
			side: sideDeck,
			banListHash: room.banListHash,
		});

		room.setDecksToPlayer(player.position, deck);
		const duelStartMessage = DuelStartClientMessage.create();
		player.sendMessage(duelStartMessage);
		player.ready();

		// --- Team-based Side Decking Timer Logic ---
		const teams = [0, 1];
		const teamReady = teams.map(
			(team) =>
				room.clients.filter((c) => c.team === team && c.isReady).length ===
				room.clients.filter((c) => c.team === team).length
		);
		const teamNotReady = teams.map(
			(team) => room.clients.filter((c) => c.team === team && !c.isReady).length > 0
		);

		if (teamReady[0] && teamNotReady[1]) {
			this.startSideDeckingTimer(room, 1);
		} else if (teamReady[1] && teamNotReady[0]) {
			this.startSideDeckingTimer(room, 0);
		} else if (teamReady[0] && teamReady[1]) {
			this.clearSideDeckingTimer();
			room.spectators.forEach((spectator: Client) => {
				spectator.sendMessage(duelStartMessage);
			});
			this.startDuel(room);

			return;
		} else {
			// Both teams not ready, do nothing
			this.clearSideDeckingTimer();
		}

		if (player.isReconnecting) {
			player.sendMessage(DuelStartClientMessage.create());
			player.notReady();
			const message = SideDeckClientMessage.create();
			player.sendMessage(message);
			player.clearReconnecting();

			return;
		}
	}

	private startSideDeckingTimer(room: Room, team: number): void {
		if (this.sideDeckingTimer && this.sideDeckingTimerTeam === team) {
			return; // Timer already running for this team
		}
		this.clearSideDeckingTimer();
		this.sideDeckingTimerTeam = team;
		this.logger.info("Side decking timer started for opposing team.");
		const timerCallback = () => {
			const notReady = room.clients.filter((c) => c.team === team && !c.isReady);
			if (notReady.length > 0) {
				this.logger.info(`Side decking timer expired. Team ${team} did not finish in time.`);
				const finishDuelHandler = new FinishDuelHandler({
					reason: DuelFinishReason.TIMEOUT,
					winner: 1 - team, // Opposing team wins
					room,
				});
				// eslint-disable-next-line @typescript-eslint/no-floating-promises
				finishDuelHandler.run();
			}
			this.clearSideDeckingTimer();
		};
		this.sideDeckingTimer = new Timer(this.sideDeckingTimeoutMs, timerCallback);
		this.sideDeckingTimer.start();
		// Schedule warning
		this.sideDeckingWarningTimeout = setTimeout(() => {
			this.logger.info("Side decking timer is about to expire.");
		}, this.sideDeckingTimeoutMs - this.sideDeckingWarningMs);
	}

	private clearSideDeckingTimer(): void {
		if (this.sideDeckingTimer) {
			this.sideDeckingTimer.stop();
			this.sideDeckingTimer = null;
		}
		if (this.sideDeckingWarningTimeout) {
			clearTimeout(this.sideDeckingWarningTimeout);
			this.sideDeckingWarningTimeout = null;
		}
		this.sideDeckingTimerTeam = null;
	}

	private startDuel(room: Room): void {
		this.logger.debug("SIDE_DECKING: START_DUEL");

		const allClientsNotReady = room.clients.some((client: Client) => !client.isReady);
		if (allClientsNotReady) {
			return;
		}

		const message = ChooseOrderClientMessage.create();
		room.clientWhoChoosesTurn.socket.send(message);
		room.choosingOrder();
	}
}
