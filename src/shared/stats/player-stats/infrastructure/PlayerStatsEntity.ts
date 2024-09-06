import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("player_stats")
export class PlayerStatsEntity {
	@PrimaryColumn()
	id: string;

	@Column({ name: "ban_list_name" })
	banListName: string;

	@Column()
	wins: number;

	@Column()
	losses: number;

	@Column()
	points: number;

	@Column({ name: "user_id" })
	userId: string;
}
