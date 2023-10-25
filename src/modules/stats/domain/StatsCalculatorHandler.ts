import { PlayerData } from "../../room/domain/domain-events/GameOverDomainEvent";

export interface StatsCalculatorHandler {
	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler;
	calculate(player: PlayerData): Promise<void>;
}
