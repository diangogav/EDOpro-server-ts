import { Player } from "../../../room/match/domain/Match";

export interface StatsCalculatorHandler {
	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler;
	calculate(player: Player): Promise<void>;
}
