import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "tournaments" })
export class TournamentEntity {
	@PrimaryColumn()
	id: string;

	@Column()
	name: string;

	@Column()
	mode: number;

	@Column()
	userId: string;

	@Column()
	rule: string;

	@Column({ name: "start_date" })
	startDate: Date;

	@Column()
	type: string;

	@Column({ name: "ban_list_name" })
	banListName: string;

	@Column()
	url: string;

	@Column()
	status: string;
}
