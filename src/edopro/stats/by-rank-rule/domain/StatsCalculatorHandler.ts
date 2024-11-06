import { Player } from "src/shared/room/domain/match/domain/Match";

export interface StatsCalculatorHandler {
	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler;
	calculate(player: Player): Promise<void>;
}
