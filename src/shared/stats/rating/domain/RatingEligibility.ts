import type { Team } from "@shared/room/Team";

export type RatedMatchPlayer = {
	id: string;
	team: Team;
	name: string;
	winner: boolean;
};

export type RatingEligibilityMatchPlayer = {
	id: string | null;
	team: Team;
	name: string;
	winner: boolean;
};

export type RatingEligibilityMatch = {
	ranked: boolean;
	banListName: string;
	players: RatingEligibilityMatchPlayer[];
};

export type RatingEligibility =
	| { eligible: true; banListName: string; players: RatedMatchPlayer[] }
	| { eligible: false; reason: "unranked" }
	| { eligible: false; reason: "no-ranked-banlist" }
	| { eligible: false; reason: "missing-account-id"; missingIdCount: number };

export function evaluateRatingEligibility(match: RatingEligibilityMatch): RatingEligibility {
	if (!match.ranked) {
		return { eligible: false, reason: "unranked" };
	}

	if (!match.banListName || match.banListName === "N/A") {
		return { eligible: false, reason: "no-ranked-banlist" };
	}

	const missingIdCount = match.players.filter((player) => player.id === null).length;
	if (missingIdCount > 0) {
		return { eligible: false, reason: "missing-account-id", missingIdCount };
	}

	return {
		eligible: true,
		banListName: match.banListName,
		players: match.players.map((player) => ({
			id: player.id as string,
			team: player.team,
			name: player.name,
			winner: player.winner,
		})),
	};
}
