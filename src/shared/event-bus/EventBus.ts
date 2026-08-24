import { Service } from "diod";

import { Logger } from "@shared/logger/domain/Logger";

export interface DomainEventSubscriber<T> {
	handle(event: T): Promise<void> | void;
}

@Service()
export class EventBus {
	private readonly subscribers: Map<string, Array<DomainEventSubscriber<unknown>>> = new Map();

	constructor(private readonly logger: Logger) {}

	subscribe(eventName: string, subscriber: DomainEventSubscriber<unknown>): void {
		if (!this.subscribers.has(eventName)) {
			this.subscribers.set(eventName, []);
		}
		this.subscribers.get(eventName)?.push(subscriber);
	}

	async publish<T>(eventName: string, event: T): Promise<void> {
		const subscribers = this.subscribers.get(eventName);
		if (!subscribers || subscribers.length === 0) {
			return;
		}

		const results = await Promise.allSettled(
			subscribers.map((subscriber) => Promise.resolve().then(() => subscriber.handle(event))),
		);

		results.forEach((result, index) => {
			if (result.status === "rejected") {
				const subscriber = subscribers[index];
				this.logger.error(result.reason, {
					event: eventName,
					subscriber: subscriber.constructor.name,
				});
			}
		});
	}
}
