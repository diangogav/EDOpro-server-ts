/* eslint-disable no-await-in-loop */
import { DomainEventSubscriber } from "../../shared/event-bus/EventBus";
import { GameOverDomainEvent } from "../domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../domain/RoomRepository";

export class RecordMatch implements DomainEventSubscriber<GameOverDomainEvent> {
	static readonly ListenTo = GameOverDomainEvent.DOMAIN_EVENT;

	private readonly roomRepository: RoomRepository;

	constructor(roomRepository: RoomRepository) {
		this.roomRepository = roomRepository;
	}

	async handle(event: GameOverDomainEvent): Promise<void> {
		if (!event.data.ranked) {
			return;
		}
		for (const player of event.data.players) {
			const wins = player.games.filter((round) => round.result === "winner").length;
			const defeats = player.games.filter((round) => round.result === "loser").length;
			const earnedPoints = this.calculateEarnedPoints(wins, defeats, player.winner);
			await this.roomRepository.saveMatch(player.name, event.data);
			await this.roomRepository.updatePlayerPoints(player.name, earnedPoints);

			if (player.winner) {
				await this.roomRepository.increaseWins(player.name);
			} else {
				await this.roomRepository.increaseLoses(player.name);
			}
		}
	}

	private calculateEarnedPoints(wins: number, defeats: number, winner: boolean): number {
		if (winner) {
			return (wins - defeats) * 2;
		}

		return wins;
	}
}
