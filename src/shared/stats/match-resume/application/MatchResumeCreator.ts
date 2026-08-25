import { randomUUID } from "crypto";

import { MatchResume, MatchResumeData } from "../domain/MatchResume";
import { MatchResumeRepository } from "../domain/MatchResumeRepository";

export class MatchResumeCreator {
	constructor(private readonly matchResumeRepository: MatchResumeRepository) {}

	async run(payload: Omit<MatchResumeData, "id">): Promise<{ id: string }> {
		const id = randomUUID();
		const matchResume = MatchResume.create({ id, ...payload });
		await this.matchResumeRepository.create(matchResume);

		return { id };
	}
}
