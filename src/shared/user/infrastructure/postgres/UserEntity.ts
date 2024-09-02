import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({
	name: "users",
})
export class UserEntity {
	@PrimaryColumn()
	id: string;

	@Column()
	username: string;

	@Column()
	password: string;

	@Column("simple-json")
	avatar: string;
}
