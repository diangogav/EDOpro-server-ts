import { PlayerData } from "../../shared/player/domain/PlayerData";

export interface StatsCalculatorHandler {
	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler;
	calculate(player: PlayerData): Promise<void>;
}
