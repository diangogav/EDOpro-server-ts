/**
 * Synchronous, ordered dispatch of duel events to internal subscribers.
 *
 * Deliberately NOT the async EventBus: room mutations (LPs, turn) must land
 * before the message loop touches the next core message — an async publish
 * would defer them to microtasks and later messages in the same batch would
 * read stale room state. Subscribers here are first-party code, so errors
 * propagate to the caller instead of being swallowed.
 */
import { YgoRoom } from "../YgoRoom";

import {
	DamageDealtEvent,
	DuelEventKind,
	LifeRecoveredEvent,
	LpCostPaidEvent,
	TurnStartedEvent,
} from "./DuelEvents";

export interface DuelEventPayloads {
	"duel.damage": DamageDealtEvent;
	"duel.recover": LifeRecoveredEvent;
	"duel.lp-cost": LpCostPaidEvent;
	"duel.turn-start": TurnStartedEvent;
}

export type DuelEventHandler<K extends DuelEventKind> = (
	event: DuelEventPayloads[K],
	room: YgoRoom,
) => void;

export class DuelEventDispatcher {
	private readonly handlers = new Map<DuelEventKind, Array<DuelEventHandler<DuelEventKind>>>();

	subscribe<K extends DuelEventKind>(kind: K, handler: DuelEventHandler<K>): void {
		const existing = this.handlers.get(kind) ?? [];
		existing.push(handler as DuelEventHandler<DuelEventKind>);
		this.handlers.set(kind, existing);
	}

	dispatch<K extends DuelEventKind>(kind: K, event: DuelEventPayloads[K], room: YgoRoom): void {
		const handlers = this.handlers.get(kind);
		if (!handlers) {
			return;
		}

		for (const handler of handlers) {
			handler(event, room);
		}
	}
}
