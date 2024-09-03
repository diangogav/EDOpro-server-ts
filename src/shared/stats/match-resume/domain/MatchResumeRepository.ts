import { DuelResume } from "../duel-resume/domain/DuelResume";
import { MatchResume } from "./MatchResume";

export interface MatchResumeRepository {
	create(matchResume: MatchResume): Promise<void>;
	createDuelResume(duelResume: DuelResume): Promise<void>;
}
