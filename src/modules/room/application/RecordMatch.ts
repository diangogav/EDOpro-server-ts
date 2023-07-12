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
		for (const player of event.data.players) {
			const wins = player.games.filter((round) => round.result === "winner").length;
			const earnedPoints = this.calculateEarnedPoints(wins);
			await this.roomRepository.saveMatch(player.name, event.data);
			await this.roomRepository.updatePlayerPoints(player.name, earnedPoints);

			if (player.winner) {
				await this.roomRepository.increaseWins(player.name);
			} else {
				await this.roomRepository.increaseLoses(player.name);
			}
		}
	}

	private calculateEarnedPoints(wins: number): number {
		return Math.pow(2, wins) - 1;
	}
}
