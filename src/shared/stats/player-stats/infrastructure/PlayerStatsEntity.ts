import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("player_stats")
@Index(["userId", "banListName"], { unique: true })
export class PlayerStatsEntity {
	@PrimaryGeneratedColumn("uuid")
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
