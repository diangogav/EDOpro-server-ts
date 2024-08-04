import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { Client } from "../../client/domain/Client";
import { DuelEndMessage } from "../../messages/server-to-client/game-messages/DuelEndMessage";
import { SideDeckClientMessage } from "../../messages/server-to-client/game-messages/SideDeckClientMessage";
import { SideDeckWaitClientMessage } from "../../messages/server-to-client/game-messages/SideDeckWaitClientMessage";
import { WinClientMessage } from "../../messages/server-to-client/game-messages/WinClientMessage";
import { ReplayBufferMessage } from "../../messages/server-to-client/ReplayBufferMessage";
import { ReplayPromptMessage } from "../../messages/server-to-client/ReplayPromptMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { container } from "../../shared/dependency-injection";
import { EventBus } from "../../shared/event-bus/EventBus";
import { GameOverDomainEvent } from "../../shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { DuelFinishReason } from "../domain/DuelFinishReason";
import { Room } from "../domain/Room";

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
		this.room.duelWinner(this.winner);
		WebSocketSingleton.getInstance().broadcast({
			action: "UPDATE-ROOM",
			data: this.room.toRealTimePresentation(),
		});
		this.room.stopRoomTimer();
		this.room.stopTimer(0);
		this.room.stopTimer(1);

		const scoreTitleMessage = ServerMessageClientMessage.create(this.room.score);
		this.room.clients.forEach((player: Client) => {
			player.sendMessage(scoreTitleMessage);
		});

		this.room.spectators.forEach((spectator: Client) => {
			spectator.sendMessage(scoreTitleMessage);
		});

		const replayPromptMessage = ReplayPromptMessage.create();
		if (this.reason === DuelFinishReason.SURRENDERED || this.reason === DuelFinishReason.TIMEOUT) {
			const winMessage = WinClientMessage.create({
				reason: this.reason,
				winner: this.room.firstToPlay ^ this.winner,
			});

			this.room.replay.addMessage(winMessage.subarray(3));

			this.room.clients.forEach((item: Client) => {
				item.sendMessage(winMessage);
			});
			this.room.spectators.forEach((item: Client) => {
				item.sendMessage(winMessage);
			});
		}

		this.room.replay.addPlayers(this.room.clients as Client[]);

		const replayData = await this.room.replay.serialize();
		this.room.resetReplay();

		const replayMessage = ReplayBufferMessage.create(replayData);

		this.room.clients.forEach((item: Client) => {
			item.sendMessage(replayMessage);
		});

		this.room.spectators.forEach((item: Client) => {
			item.sendMessage(replayMessage);
		});

		this.room.clients.forEach((item: Client) => {
			item.sendMessage(replayPromptMessage);
		});

		this.room.spectators.forEach((item: Client) => {
			item.sendMessage(replayPromptMessage);
		});

		if (this.room.isMatchFinished()) {
			this.room.clients.forEach((player: Client) => {
				player.sendMessage(DuelEndMessage.create());
			});

			this.room.spectators.forEach((player: Client) => {
				player.sendMessage(DuelEndMessage.create());
			});

			// this.room.duel?.kill("SIGTERM");

			// RoomList.deleteRoom(this.room);

			this.eventBus.publish(
				GameOverDomainEvent.DOMAIN_EVENT,
				new GameOverDomainEvent({
					bestOf: this.room.bestOf,
					players: this.room.matchPlayersHistory,
					date: new Date(),
					ranked: this.room.ranked,
					banlistHash: this.room.banlistHash,
				})
			);

			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: this.room.toRealTimePresentation(),
			});

			return;
		}

		const message = SideDeckClientMessage.create();

		this.room.sideDecking();

		if (this.winner === 0) {
			const looser = this.room.clients.find(
				(_client: Client) => _client.position % this.room.team1 === 0 && _client.team === 1
			);
			if (looser && looser instanceof Client) {
				this.room.setClientWhoChoosesTurn(looser);
			}
		} else {
			const looser = this.room.clients.find(
				(_client: Client) => _client.position % this.room.team0 === 0 && _client.team === 0
			);
			if (looser && looser instanceof Client) {
				this.room.setClientWhoChoosesTurn(looser);
			}
		}

		this.room.clients.forEach((client: Client) => {
			client.sendMessage(message);
			client.notReady();
		});

		this.room.spectators.forEach((spectator: Client) => {
			spectator.sendMessage(SideDeckWaitClientMessage.create());
		});
	}
}
