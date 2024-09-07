import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "matches",
})
export class MatchResumeEntity {
	@PrimaryColumn()
	id: string;

	@Column({ name: "user_id" })
	userId: string;

	@Column({ name: "best_of" })
	bestOf: number;

	@Column({ name: "player_names", type: "simple-array" })
	playerNames: string[];

	@Column({ name: "opponent_names", type: "simple-array" })
	opponentNames: string[];

	@Column()
	date: Date;

	@Column({ name: "ban_list_name" })
	banListName: string;

	@Column({ name: "ban_list_hash" })
	banListHash: string;

	@Column({ name: "player_score" })
	playerScore: number;

	@Column({ name: "opponent_score" })
	opponentScore: number;

	@Column()
	winner: boolean;

	@Column()
	season: number;
}
