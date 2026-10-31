import { EntitySchema } from "typeorm";

export interface TournamentRow {
	id: string;
	organizerId: string;
	revision: number;
	active: boolean;
	document: string;
}

export const TournamentRowSchema = new EntitySchema<TournamentRow>({
	name: "CommunityTournamentBracket",
	tableName: "community_tournament_brackets",
	columns: {
		id: { type: String, primary: true },
		organizerId: { name: "organizer_id", type: String },
		revision: { type: Number },
		active: { type: Boolean },
		document: { type: "text" },
	},
	indices: [{ name: "IDX_community_tournament_owner_active", columns: ["organizerId", "active"] }],
});
