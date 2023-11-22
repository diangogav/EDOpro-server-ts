import { BanList } from "../../ban-list/domain/BanList";
import { RoomRepository } from "../../room/domain/RoomRepository";
import { Player } from "../../shared/player/domain/Player";
import { StatsCalculatorHandler } from "../domain/StatsCalculatorHandler";
import { RankRule } from "../rank-rules/domain/RankRule";
import { RankRuleRepository } from "../rank-rules/domain/RankRuleRepository";

export class EarnedPointsCalculator implements StatsCalculatorHandler {
	private readonly roomRepository: RoomRepository;
	private nextHandler: StatsCalculatorHandler | null = null;
	private readonly banlist: BanList | null;
	private readonly players: Player[];
	private readonly rankRuleRepository: RankRuleRepository;

	constructor(
		roomRepository: RoomRepository,
		banlist: BanList | null,
		players: Player[],
		rankRuleRepository: RankRuleRepository
	) {
		this.roomRepository = roomRepository;
		this.banlist = banlist;
		this.players = players;
		this.rankRuleRepository = rankRuleRepository;
	}

	setNextHandler(handler: StatsCalculatorHandler): StatsCalculatorHandler {
		this.nextHandler = handler;

		return handler;
	}

	async calculate(player: Player): Promise<void> {
		const opponent = this.players.find((item) => item.name !== player.name);
		if (!opponent || this.players.length > 2) {
			if (this.nextHandler) {
				return this.nextHandler.calculate(player);
			}

			return;
		}

		const playerRule = await this.rankRuleRepository.findByRankPosition(player.globalRank.value);
		const opponentRule = await this.rankRuleRepository.findByRankPosition(
			opponent.globalRank.value
		);
		const points = this.calculatePoints(player.winner, playerRule, opponentRule);
		await this.roomRepository.updatePlayerPoints(player.name, points);

		if (this.banlist?.name) {
			const playerBanListRule = await this.rankRuleRepository.findByRankPosition(
				player.getBanListRank(this.banlist.name).value
			);
			const opponentBanListRule = await this.rankRuleRepository.findByRankPosition(
				opponent.getBanListRank(this.banlist.name).value
			);
			const points = this.calculatePoints(player.winner, playerBanListRule, opponentBanListRule);
			await this.roomRepository.updatePlayerPointsByBanList(player.name, points, this.banlist);
		}
		if (this.nextHandler) {
			return this.nextHandler.calculate(player);
		}
	}

	private calculatePoints(winner: boolean, playerRule: RankRule, opponentRule: RankRule) {
		const points = playerRule.calculatePoints(opponentRule);

		if (winner) {
			return points.earned;
		}

		return -points.lost;
	}
}
