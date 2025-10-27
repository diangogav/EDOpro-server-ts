/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-await-in-loop */
import * as cheerio from "cheerio";
import { writeFile } from "fs/promises";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

const logger = LoggerFactory.getLogger();

interface YgoResponse {
	id: number;
}

interface CardInfo {
	name: string;
	points: number;
	id: number;
}

const url = "https://www.yugioh-card.com/en/genesys/";

async function scrapeGenesys(): Promise<void> {
	try {
		logger.info("Starting Genesys card data scrape...");

		const html = await fetch(url).then((response) => response.text());
		const $ = cheerio.load(html);

		const rows = $("#tablepress-genesys tbody tr").toArray();
		const cards: CardInfo[] = [];
		const notFound: string[] = [];

		for (const el of rows) {
			const name = $(el).find("td.column-1").text().trim();
			const pointsText = $(el).find("td.column-2").text().trim();
			const points = Number(pointsText) || 0;

			logger.info(`Processing card: ${name} with points: ${points}`);

			if (!name) {
				continue;
			}

			const cardInfo = await fetchCardInfo(name);

			if (!cardInfo) {
				logger.error(`Card not found in API: ${name}`);
				notFound.push(name);
				continue;
			}

			cards.push({
				name,
				points,
				id: Number(cardInfo.id),
			});
		}

		await writeFile("genesys_cards.json", JSON.stringify(cards, null, 2));
		await writeFile("genesys_not_found.json", JSON.stringify(notFound, null, 2));

		logger.info(`✅ Genesys card data scrape completed. Found ${cards.length} cards.`);
		logger.info(`⚠️ Saved ${notFound.length} not found cards.`);
	} catch (error) {
		logger.error("❌ An error occurred during the Genesys card data scrape:");
		logger.error(error as Error);
	}
}

async function fetchCardInfo(name: string): Promise<YgoResponse | null> {
	const apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`;

	try {
		const response = await fetch(apiUrl);
		const { data }: { data: YgoResponse[] } | { data: undefined } = await response.json();

		if (!data || !Array.isArray(data)) {
			return null;
		}

		const cardData = data[0];

		if (!cardData.id) {
			return null;
		}

		return cardData;
	} catch (error) {
		logger.error(`Error fetching card info for ${name}`);
		logger.error(error as Error);

		return null;
	}
}

scrapeGenesys()
	.then(() => {
		logger.info("Scraping process finished.");
	})
	.catch((error) => {
		logger.error("Scraping process encountered an error:");
		logger.error(error as Error);
	});
