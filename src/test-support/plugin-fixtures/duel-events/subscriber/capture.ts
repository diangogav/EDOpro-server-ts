import { DamageDealtEvent } from "@shared/room/domain/duel-events/DuelEvents";

export const receivedEvents: DamageDealtEvent[] = [];

export function resetReceivedEvents(): void {
	receivedEvents.length = 0;
}
