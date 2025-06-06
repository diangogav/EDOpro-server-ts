/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import EventEmitter from "events";

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
import { JoinToDuelAsSpectator } from "../../../application/JoinToDuelAsSpectator";
import { Reconnect } from "../../../application/Reconnect";
import { FinishDuelHandler } from "../../../application/FinishDuelHandler";
import { Room } from "../../Room";
import { DuelFinishReason } from "../../DuelFinishReason";
import { RoomState } from "../../RoomState";

const SIDE_DECK_TIMEOUT = 60_000; // 60 seconds
const SIDE_DECK_WARNING = 5_000; // warn 5 seconds before timeout

export class SideDeckingState extends RoomState {
       private sideTimer: NodeJS.Timeout | null = null;
       private warningTimer: NodeJS.Timeout | null = null;
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

       private startSideTimer(room: Room, winnerTeam: number): void {
               this.clearSideTimer();
               this.logger.info("Side decking timer started for opposing team.");
               this.warningTimer = setTimeout(() => {
                       this.logger.warn("Side decking timer is about to expire.");
               }, SIDE_DECK_TIMEOUT - SIDE_DECK_WARNING);
               this.sideTimer = setTimeout(() => {
                       const finish = new FinishDuelHandler({
                               reason: DuelFinishReason.TIMEOUT,
                               winner: winnerTeam,
                               room,
                       });
                       void finish.run();
               }, SIDE_DECK_TIMEOUT);
       }

       private clearSideTimer(): void {
               if (this.sideTimer) {
                       clearTimeout(this.sideTimer);
                       this.sideTimer = null;
               }
               if (this.warningTimer) {
                       clearTimeout(this.warningTimer);
                       this.warningTimer = null;
               }
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

		if (player.isReconnecting) {
			player.sendMessage(DuelStartClientMessage.create());
			player.notReady();
			const message = SideDeckClientMessage.create();
			player.sendMessage(message);
			player.clearReconnecting();

			return;
		}

                room.spectators.forEach((spectator: Client) => {
                        spectator.sendMessage(duelStartMessage);
                });

                const teamReady = room.clients
                        .filter((c: Client) => c.team === player.team)
                        .every((c: Client) => c.isReady);
                const opponentTeam = player.team === 0 ? 1 : 0;
                const opponentReady = room.clients
                        .filter((c: Client) => c.team === opponentTeam)
                        .every((c: Client) => c.isReady);

                if (teamReady && opponentReady) {
                        this.clearSideTimer();
                        this.startDuel(room);

                        return;
                }

                if (teamReady && !opponentReady && this.sideTimer === null) {
                        this.startSideTimer(room, player.team);

                        return;
                }
	}

        private startDuel(room: Room): void {
                this.logger.debug("SIDE_DECKING: START_DUEL");

               this.clearSideTimer();

		const allClientsNotReady = room.clients.some((client: Client) => !client.isReady);
		if (allClientsNotReady) {
			return;
		}

		const message = ChooseOrderClientMessage.create();
		room.clientWhoChoosesTurn.socket.send(message);
		room.choosingOrder();
	}
}
