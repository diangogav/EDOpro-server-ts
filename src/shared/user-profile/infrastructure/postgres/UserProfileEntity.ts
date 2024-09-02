import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "users",
})
export class UserProfileEntity {
	@PrimaryColumn()
	id: string;

	@Column()
	username: string;

	@Column()
	password: string;

	@Column()
	email: string;

	@Column("simple-json", { nullable: true })
	avatar: string | null;
}
