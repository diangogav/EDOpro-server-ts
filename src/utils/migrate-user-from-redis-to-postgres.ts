import * as fs from "fs";
import { Redis } from "src/shared/db/redis/infrastructure/Redis";
import { Pino } from "src/shared/logger/infrastructure/Pino";
import { MatchResumeCreator } from "src/shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "src/shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "src/shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { UserProfileCreator } from "src/shared/user-profile/application/UserProfileCreator";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { PostgresTypeORM } from "../evolution-types/src/PostgresTypeORM";

interface Game {
	result: "winner" | "loser";
	turns: number;
}

interface Rank {
	name: string;
	position: number | null;
	points: string | number;
}

interface Points {
	[key: string]: number;
}

interface Player {
	team: number;
	name: string;
	winner: boolean;
	games: Game[];
	points: Points;
	score: number;
	ranks: Rank[];
}

interface DuelResume {
	bestOf: number;
	date: string;
	players: Player[];
	ranked: boolean;
	banlistHash: string;
	banlistName: string;
}

const redis = Redis.getInstance();
const logger = new Pino();
const postgresDatabase = new PostgresTypeORM();

const migratedUsersFile = "migrated_users.txt";
const skippedUsersFile = "skipped_users.txt";
const failedMatchesFile = "failed_matches.txt";
const failedDuelsFile = "failed_duels.txt";

async function run() {
	if (!redis) {
		return;
	}
	await postgresDatabase.connect();
	const userProfileCreator = new UserProfileCreator(new UserProfilePostgresRepository());
	const matchResumeCreator = new MatchResumeCreator(new MatchResumePostgresRepository());
	const duelResumeCreator = new DuelResumeCreator(new MatchResumePostgresRepository());
	const userKeys = await redis.keys("user:*");
	const filteredKeys = userKeys.filter((key) => !key.includes(":duels"));

	for (const key of filteredKeys) {
		// eslint-disable-next-line no-await-in-loop
		const userInfo: Record<string, string> = await redis.hgetall(key);

		if (!userInfo.username || !userInfo.password) {
			fs.appendFileSync(skippedUsersFile, `User key ${key}: ${JSON.stringify(userInfo)}\n`);
			logger.error(`User key ${key} skipped due to missing username or password.`);
			continue;
		}

		// eslint-disable-next-line no-await-in-loop
		const { id: userId } = await userProfileCreator.run({
			username: userInfo.username,
			email: userInfo.email,
			password: userInfo.password,
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			avatar: userInfo?.avatar ?? null,
		});
		logger.info(`Obtaining duels for ${key}:duels`);
		// eslint-disable-next-line no-await-in-loop
		const matches = await redis.lrange(`${key}:duels`, 0, -1);

		for (const match of matches) {
			try {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const data: DuelResume = JSON.parse(match);
				const playerName = key.split(":")[1];
				const player = data.players.find((player) => player.name === playerName);
				const opponent = data.players.find(
					(element) => element.name !== playerName && element.team !== player?.team
				);
				const playerNames = data.players
					.filter((item) => item.team === player?.team)
					.map((element) => element.name);

				const opponentNames = data.players
					.filter((item) => item.team !== player?.team)
					.map((element) => element.name);

				if (!player || !opponent) {
					continue;
				}

				// eslint-disable-next-line no-await-in-loop
				const { id: matchId } = await matchResumeCreator.run({
					userId,
					bestOf: data.bestOf,
					playerNames,
					opponentNames,
					date: new Date(data.date),
					banListName: data.banlistName,
					banListHash: data.banlistHash,
					playerScore: player.score,
					opponentScore: opponent.score,
					winner: player.winner,
					season: 3,
					points: player.score - opponent.score,
				});
				const games = player.games;
				for (const game of games) {
					try {
						// eslint-disable-next-line no-await-in-loop
						await duelResumeCreator.run({
							userId,
							playerNames,
							opponentNames,
							date: new Date(data.date),
							banListName: data.banlistName,
							banListHash: data.banlistHash,
							result: game.result,
							turns: game.turns,
							matchId,
							season: 3,
							ipAddress: null,
						});
					} catch (error) {
						fs.appendFileSync(
							failedDuelsFile,
							`Failed to save duel for user key ${key}: ${JSON.stringify(game)}\n`
						);
						logger.error(`Failed to save duel for user key ${key}`);
						logger.error(error as Error);
					}
				}
			} catch (error) {
				fs.appendFileSync(
					failedMatchesFile,
					`Failed to save match for user key ${key}: ${JSON.stringify(match)}\n`
				);
				logger.error(`Failed to save match for user key ${key}`);
				logger.error(error as Error);
			}
		}

		fs.appendFileSync(migratedUsersFile, `User key ${key}: ${JSON.stringify(userInfo)}\n`);

		logger.info(`User key ${key} migrated successfully.`);
	}
}

run()
	.then(async () => {
		logger.info("All users processed");
		await postgresDatabase.close();
	})
	.catch(async (error) => {
		logger.error(error as Error);
		await postgresDatabase.close();
	});
