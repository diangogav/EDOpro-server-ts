import { GameOverDomainEvent } from "../../room/domain/domain-events/GameOverDomainEvent";
import { DuelFinishReason } from "../../room/domain/DuelFinishReason";
import { Room } from "../../room/domain/Room";
import { container } from "../../shared/dependency-injection";
import { EventBus } from "../../shared/event-bus/EventBus";
import { DuelEndMessage } from "../server-to-client/game-messages/DuelEndMessage";
import { SideDeckClientMessage } from "../server-to-client/game-messages/SideDeckClientMessage";
import { SideDeckWaitClientMessage } from "../server-to-client/game-messages/SideDeckWaitClientMessage";
import { WinClientMessage } from "../server-to-client/game-messages/WinClientMessage";
import { ReplayBufferMessage } from "../server-to-client/ReplayBufferMessage";
import { ReplayPromptMessage } from "../server-to-client/ReplayPromptMessage";
import { ServerMessageClientMessage } from "../server-to-client/ServerMessageClientMessage";

export class FinishDuelHandler {
	private readonly reason: DuelFinishReason;
	private readonly winner: number;
	private readonly room: Room;
	private readonly eventBus: EventBus;

	constructor({ reason, winner, room }: { reason: DuelFinishReason; winner: number; room: Room }) {
		this.reason = reason;
		this.winner = winner;
		this.room = room;
		this.eventBus = container.get(EventBus);
	}

	async run(): Promise<void> {
		this.room.duel?.kill();
		this.room.duelWinner(this.winner);

		this.room.stopRoomTimer();
		this.room.stopTimer(0);
		this.room.stopTimer(1);

		const scoreTitleMessage = ServerMessageClientMessage.create(
			`Score: ${this.room.playerNames(0)}: ${this.room.matchScore().team0} - ${
				this.room.matchScore().team1
			} ${this.room.playerNames(1)}`
		);
		this.room.clients.forEach((player) => {
			player.sendMessage(scoreTitleMessage);
		});

		this.room.spectators.forEach((spectator) => {
			spectator.sendMessage(scoreTitleMessage);
		});

		const replayPromptMessage = ReplayPromptMessage.create();
		const winMessage = WinClientMessage.create({
			reason: 0,
			winner: this.winner,
		});

		this.room.replay.addPlayers(this.room.clients);
		this.room.replay.addMessage(winMessage);
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		const replayData = await this.room.replay.serialize();
		this.room.resetReplay();

		const replayMessage = ReplayBufferMessage.create(replayData);

		if (this.reason === DuelFinishReason.SURRENDERED) {
			this.room.clients.forEach((item) => {
				item.sendMessage(winMessage);
			});

			this.room.spectators.forEach((item) => {
				item.sendMessage(winMessage);
			});
		}

		this.room.clients.forEach((item) => {
			item.sendMessage(replayMessage);
		});

		this.room.spectators.forEach((item) => {
			item.sendMessage(replayMessage);
		});

		this.room.clients.forEach((item) => {
			item.sendMessage(replayPromptMessage);
		});

		this.room.spectators.forEach((item) => {
			item.sendMessage(replayPromptMessage);
		});

		if (this.room.isMatchFinished()) {
			this.room.clients.forEach((player) => {
				player.sendMessage(DuelEndMessage.create());
			});

			this.room.spectators.forEach((player) => {
				player.sendMessage(DuelEndMessage.create());
			});

			// this.room.duel?.kill("SIGTERM");

			// RoomList.deleteRoom(this.room);

			this.eventBus.publish(
				GameOverDomainEvent.DOMAIN_EVENT,
				new GameOverDomainEvent({
					bestOf: this.room.bestOf,
					turn: this.room.turn,
					players: this.room.matchPlayersHistory,
					date: new Date(),
					ranked: this.room.ranked,
				})
			);

			return;
		}

		const message = SideDeckClientMessage.create();

		this.room.sideDecking();

		if (this.winner === 0) {
			const looser = this.room.clients.find(
				(_client) => _client.position % this.room.team1 === 0 && _client.team === 1
			);
			if (looser) {
				this.room.setClientWhoChoosesTurn(looser);
			}
		} else {
			const looser = this.room.clients.find(
				(_client) => _client.position % this.room.team0 === 0 && _client.team === 0
			);
			if (looser) {
				this.room.setClientWhoChoosesTurn(looser);
			}
		}

		this.room.clients.forEach((client) => {
			client.sendMessage(message);
			client.notReady();
		});

		this.room.spectators.forEach((spectator) => {
			spectator.sendMessage(SideDeckWaitClientMessage.create());
		});
	}
}
