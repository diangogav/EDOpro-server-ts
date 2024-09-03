import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "duels",
})
export class DuelResumeEntity {
	@PrimaryColumn()
	id: string;

	@Column({ name: "user_name" })
	userId: string;

	@Column({ name: "player_name" })
	playerName: string;

	@Column({ name: "opponent_name" })
	opponentName: string;

	@Column()
	date: Date;

	@Column({ name: "ban_list_name" })
	banListName: string;

	@Column({ name: "ban_list_hash" })
	banListHash: string;

	@Column()
	result: string;

	@Column()
	turns: number;

	@Column({ name: "match_id" })
	matchId: string;

	@Column()
	season: number;
}
