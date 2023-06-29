import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "texts",
})
export class CardTextEntity {
	@PrimaryColumn()
	id: number;

	@Column()
	name: string;

	@Column()
	desc: string;

	@Column()
	str1: string;

	@Column()
	str2: string;

	@Column()
	str3: string;

	@Column()
	str4: string;

	@Column()
	str5: string;

	@Column()
	str6: string;

	@Column()
	str7: string;

	@Column()
	str8: string;

	@Column()
	str9: string;

	@Column()
	str10: string;

	@Column()
	str11: string;

	@Column()
	str12: string;

	@Column()
	str13: string;

	@Column()
	str14: string;

	@Column()
	str15: string;

	@Column()
	str16: string;
}
