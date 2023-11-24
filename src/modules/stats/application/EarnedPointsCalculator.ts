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
		if (!opponent) {
			if (this.nextHandler) {
				return this.nextHandler.calculate(player);
			}

			return;
		}

		const playerRule = await this.rankRuleRepository.findByRankPosition(player.globalRank.position);
		const opponentRule = await this.rankRuleRepository.findByRankPosition(
			opponent.globalRank.position
		);
		const points = this.calculatePoints(playerRule, opponentRule, player, "Global");
		player.recordPoints("Global", points);
		await this.roomRepository.updatePlayerPoints(player.name, points);

		if (this.banlist?.name) {
			const playerBanListRule = await this.rankRuleRepository.findByRankPosition(
				player.getBanListRank(this.banlist.name).position
			);
			const opponentBanListRule = await this.rankRuleRepository.findByRankPosition(
				opponent.getBanListRank(this.banlist.name).position
			);
			const points = this.calculatePoints(
				playerBanListRule,
				opponentBanListRule,
				player,
				this.banlist.name
			);
			player.recordPoints(this.banlist.name, points);
			await this.roomRepository.updatePlayerPointsByBanList(player.name, points, this.banlist);
		}
		if (this.nextHandler) {
			return this.nextHandler.calculate(player);
		}
	}

	private calculatePoints(
		playerRule: RankRule,
		opponentRule: RankRule,
		player: Player,
		rankName: string
	) {
		const points = playerRule.calculatePoints(opponentRule);

		if (player.winner) {
			return points.earned;
		}

		const rank = player.getBanListRank(rankName);
		const difference = rank.points - points.lost;

		if (difference < 0) {
			return -rank.points;
		}

		return -points.lost;
	}
}
