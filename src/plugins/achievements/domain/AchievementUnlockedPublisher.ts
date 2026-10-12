import { AchievementUnlockedDomainEvent } from "./AchievementUnlockedDomainEvent";

/** Narrow port satisfied by the server EventBus. */
export interface AchievementUnlockedPublisher {
	publish(eventName: string, event: AchievementUnlockedDomainEvent): Promise<void>;
}
