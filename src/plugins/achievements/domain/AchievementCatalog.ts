export type CatalogAchievement = {
	id: number;
	code: string;
};

export interface AchievementCatalog {
	/** Catalog rows for the given codes; unknown codes are simply absent. */
	findByCodes(codes: string[]): Promise<CatalogAchievement[]>;
}
