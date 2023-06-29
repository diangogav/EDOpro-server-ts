import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "datas",
})
export class CardEntity {
	@PrimaryColumn()
	id: string;

	@Column()
	ot: number;

	@Column()
	alias: number;

	@Column()
	setcode: number;

	@Column()
	type: number;

	@Column()
	atk: number;

	@Column()
	def: number;

	@Column()
	level: number;

	@Column()
	race: number;

	@Column()
	attribute: number;

	@Column()
	category: number;
}
