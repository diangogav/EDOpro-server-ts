import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	PrimaryColumn,
	UpdateDateColumn,
} from "typeorm";

import { UserProfileRole } from "../../domain/UserProfileRole";

@Entity({
	name: "users",
})
export class UserProfileEntity {
	@PrimaryColumn()
	id: string;

	@Column({ unique: true })
	username: string;

	@Column()
	password: string;

	@Column({ unique: true })
	email: string;

	@Column("simple-json", { nullable: true })
	avatar: string | null;

	@Column({
		type: "enum",
		enum: UserProfileRole,
		default: UserProfileRole.USER,
	})
	role: UserProfileRole;

	@Column({ name: "discord_id", nullable: true })
	discordId: string;

	@CreateDateColumn({ name: "created_at" })
	createdAt: Date;

	@UpdateDateColumn({ name: "updated_at" })
	updatedAt: Date;

	@DeleteDateColumn({ name: "deleted_at", nullable: true })
	deletedAt: Date | null;
}
