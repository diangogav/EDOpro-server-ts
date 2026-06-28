import { YGOPRO_PROTOCOL_VERSION } from "../../ygopro/protocol-version";
import { WindbotModule } from "../application/WindbotModule";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";
import { WindbotConfigEnabled } from "./WindbotConfig";
import { FileBotlistRepository } from "./FileBotlistRepository";
import { HttpWindBotProvider } from "./HttpWindBotProvider";

// Wires windbot's concrete adapters and inits the module, so the composition
// root never has to know about them.
export function bootstrapWindbot(config: WindbotConfigEnabled, serverPort: number): WindbotModule {
	const repo = new FileBotlistRepository(config.botlistPath);
	const tokenStore = new WindbotTokenStore();
	const provider = new HttpWindBotProvider({
		endpoint: config.endpoint,
		myIp: config.myIp,
		serverPort,
		version: YGOPRO_PROTOCOL_VERSION,
	});

	WindbotModule.init({ enabled: true, repo, tokenStore, provider });

	return WindbotModule.getInstance();
}
