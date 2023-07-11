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
			// eslint-disable-next-line no-await-in-loop
			await this.roomRepository.saveMatch(player.name, event.data);
		}
	}
}
