import { randomUUID } from "crypto";

import { MatchResumeRepository } from "../../domain/MatchResumeRepository";
import { DuelResume, DuelResumeData } from "../domain/DuelResume";

export class DuelResumeCreator {
	constructor(private readonly matchResumeRepository: MatchResumeRepository) {}

	async run(payload: Omit<DuelResumeData, "id">): Promise<{ id: string }> {
		const id = randomUUID();
		const duelResume = DuelResume.create({ id, ...payload });
		await this.matchResumeRepository.createDuelResume(duelResume);

		return { id };
	}
}
