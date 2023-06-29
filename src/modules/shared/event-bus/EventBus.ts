import { Service } from "diod";

export interface DomainEventSubscriber<T> {
	handle(event: T): Promise<void> | void;
}

@Service()
export class EventBus {
	private readonly subscribers: Map<string, Array<DomainEventSubscriber<unknown>>> = new Map();

	subscribe(eventName: string, subscriber: DomainEventSubscriber<unknown>): void {
		if (!this.subscribers.has(eventName)) {
			this.subscribers.set(eventName, []);
		}
		this.subscribers.get(eventName)?.push(subscriber);
	}

	publish<T>(eventName: string, event: T): void {
		const subscribers = this.subscribers.get(eventName);
		if (subscribers) {
			subscribers.forEach((subscriber) => {
				void subscriber.handle(event);
			});
		}
	}
}
