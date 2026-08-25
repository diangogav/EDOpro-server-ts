/**
 * Bridges the synchronous DuelEventDispatcher to plugin subscribers through a
 * bounded, ordered, per-attachment queue.
 *
 * Plugins are third-party observers with no veto power over a duel, so their
 * handlers never run inside dispatch: enqueueing is the only work on the duel's
 * path, and the queue drains on a microtask, one event at a time, preserving
 * per-room order. Handler errors are logged, never rethrown.
 *
 * Two detectors feed one consequence — the plugin is disconnected from that
 * room with a loud, named error:
 *  - queue-overflow: the queue is bounded (maxQueue); a consumer slower than
 *    the duel produces all-or-nothing data instead of silent gaps.
 *  - budget-exceeded: each handle() is timed; over budgetMs logs a warning
 *    naming the plugin, and maxViolations of them disconnect it. A sync
 *    CPU-heavy handler blocks the whole event loop — nothing in-process can
 *    prevent that, so the budget attributes it instead.
 */
import { Logger } from "@shared/logger/domain/Logger";

import { YgoRoom } from "../YgoRoom";
import { DuelEventDispatcher, DuelEventPayloads } from "./DuelEventDispatcher";
import { DuelEventKind } from "./DuelEvents";

export type PluginDuelEventHandler = (
	event: DuelEventPayloads[DuelEventKind],
) => void | Promise<void>;

export interface DuelEventPluginHubOptions {
	maxQueue?: number;
	budgetMs?: number;
	maxViolations?: number;
}

interface Registration {
	pluginName: string;
	kind: DuelEventKind;
	handler: PluginDuelEventHandler;
}

interface QueuedEvent {
	event: DuelEventPayloads[DuelEventKind];
	room: YgoRoom;
	handler: PluginDuelEventHandler;
}

interface PluginDeliveryState {
	queue: QueuedEvent[];
	draining: boolean;
	violations: number;
	disconnected: boolean;
}

export class DuelEventPluginHub {
	private static instance?: DuelEventPluginHub;

	private readonly maxQueue: number;
	private readonly budgetMs: number;
	private readonly maxViolations: number;
	private readonly registrations: Registration[] = [];
	private logger?: Logger;

	constructor(options: DuelEventPluginHubOptions = {}) {
		this.maxQueue = options.maxQueue ?? 1000;
		this.budgetMs = options.budgetMs ?? 10;
		this.maxViolations = options.maxViolations ?? 3;
	}

	static getInstance(): DuelEventPluginHub {
		if (!DuelEventPluginHub.instance) {
			DuelEventPluginHub.instance = new DuelEventPluginHub();
		}

		return DuelEventPluginHub.instance;
	}

	static resetInstance(): void {
		DuelEventPluginHub.instance = undefined;
	}

	initialize(logger: Logger): void {
		this.logger = logger;
	}

	register(pluginName: string, kind: DuelEventKind, handler: PluginDuelEventHandler): void {
		this.registrations.push({ pluginName, kind, handler });
	}

	get registeredKinds(): readonly DuelEventKind[] {
		return [...new Set(this.registrations.map((registration) => registration.kind))];
	}

	/**
	 * Subscribes the registered plugin handlers to a room state's dispatcher.
	 * Delivery state (queue, violations, disconnection) is scoped to this
	 * attachment: a disconnect affects one plugin in one room, never the plugin
	 * elsewhere or the room's other plugins.
	 */
	attach(dispatcher: DuelEventDispatcher): void {
		const states = new Map<string, PluginDeliveryState>();
		const stateFor = (pluginName: string): PluginDeliveryState => {
			let state = states.get(pluginName);
			if (!state) {
				state = { queue: [], draining: false, violations: 0, disconnected: false };
				states.set(pluginName, state);
			}

			return state;
		};

		for (const registration of this.registrations) {
			dispatcher.subscribe(registration.kind, (event, room) => {
				this.enqueue(stateFor(registration.pluginName), registration, event, room);
			});
		}
	}

	private enqueue(
		state: PluginDeliveryState,
		registration: Registration,
		event: DuelEventPayloads[DuelEventKind],
		room: YgoRoom,
	): void {
		if (state.disconnected) {
			return;
		}

		if (state.queue.length >= this.maxQueue) {
			this.disconnect(state, registration.pluginName, room, "queue-overflow");

			return;
		}

		state.queue.push({ event, room, handler: registration.handler });

		if (!state.draining) {
			state.draining = true;
			queueMicrotask(() => void this.drain(state, registration.pluginName));
		}
	}

	private async drain(state: PluginDeliveryState, pluginName: string): Promise<void> {
		while (state.queue.length > 0 && !state.disconnected) {
			const item = state.queue.shift() as QueuedEvent;
			const started = process.hrtime.bigint();

			try {
				await item.handler(item.event);
			} catch (error) {
				this.logger?.error(error instanceof Error ? error : String(error), {
					plugin: pluginName,
					roomId: item.room.id,
				});
			}

			const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
			if (elapsedMs > this.budgetMs) {
				state.violations += 1;
				this.logger?.warn(
					`Duel-event handler of plugin "${pluginName}" took ${elapsedMs.toFixed(1)}ms (budget ${this.budgetMs}ms, violation ${state.violations}/${this.maxViolations})`,
					{ plugin: pluginName, roomId: item.room.id },
				);

				if (state.violations >= this.maxViolations) {
					this.disconnect(state, pluginName, item.room, "budget-exceeded");
				}
			}
		}

		state.draining = false;
	}

	private disconnect(
		state: PluginDeliveryState,
		pluginName: string,
		room: YgoRoom,
		reason: "queue-overflow" | "budget-exceeded",
	): void {
		state.disconnected = true;
		state.queue.length = 0;
		this.logger?.error(`Duel-event plugin "${pluginName}" disconnected from room ${room.id}`, {
			plugin: pluginName,
			roomId: room.id,
			reason,
		});
	}
}
