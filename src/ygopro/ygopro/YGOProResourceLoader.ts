import type { CardReaderFn } from "koishipro-core.js";
import { searchYGOProResource } from "koishipro-core.js";
import { YGOProLFList } from "ygopro-lflist-encode";
import path from "node:path";
import { runInWorker } from "yuzuthread";
import BetterLock from "better-lock";
import { CardStorage } from "./card-storage";
import { CardLoadWorker } from "./card-load-worker";
import { Logger } from "src/shared/logger/domain/Logger";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";
import { config } from "src/config";

const CARD_STORAGE_RELOAD_INTERVAL_MS = 10 * 60 * 1000;

let _sharedInstance: YGOProResourceLoader | null = null;

export class YGOProResourceLoader {
  private readonly logger: Logger;

  constructor() {
    this.logger = LoggerFactory.getLogger();
    this.registerReloadTimer();
  }

  static getShared(): YGOProResourceLoader {
    if (!_sharedInstance) {
      throw new Error(
        "YGOProResourceLoader not initialized. Call initShared() in index.ts first.",
      );
    }
    return _sharedInstance;
  }

  static async start(): Promise<void> {
    const loader = YGOProResourceLoader.get();
    await loader.loadYGOProCdbs();
  }

  static get(): YGOProResourceLoader {
    if (_sharedInstance) {
      return _sharedInstance;
    }
    _sharedInstance = new YGOProResourceLoader();
    return _sharedInstance;
  }

  static get isInitialized(): boolean {
    return _sharedInstance !== null;
  }

  ygoproPaths = config.resources.ygopro.folders;

  extraFolderPaths = config.resources.ygopro.extraFolders;

  extraScriptPaths = config.resources.ygopro.extraScripts;

  private loadingLock = new BetterLock();

  private standardLoadingPromise?: Promise<CardStorage>;
  private standardCardStorage?: CardStorage;
  private standardSha512?: Buffer;

  private extendedLoadingPromise?: Promise<CardStorage>;
  private extendedCardStorage?: CardStorage;
  private extendedSha512?: Buffer;

  private reloadTimerRegistered = false;

  get hasExtraFolderPaths(): boolean {
    return this.extraFolderPaths.length > 0;
  }

  async getCardStorage() {
    return this.getStandardCardStorage();
  }

  async getStandardCardStorage(): Promise<CardStorage> {
    if (this.standardCardStorage) {
      return this.standardCardStorage;
    }
    if (this.standardLoadingPromise) {
      return this.standardLoadingPromise;
    }
    return this.loadStandardCdbs();
  }

  async getExtendedCardStorage(): Promise<CardStorage> {
    if (!this.hasExtraFolderPaths) {
      return this.getStandardCardStorage();
    }
    if (this.extendedCardStorage) {
      return this.extendedCardStorage;
    }
    if (this.extendedLoadingPromise) {
      return this.extendedLoadingPromise;
    }
    return this.loadExtendedCdbs();
  }

  async getCardReader(): Promise<CardReaderFn> {
    const storage = await this.getStandardCardStorage();
    return storage.toCardReader();
  }

  async getExtendedCardReader(): Promise<CardReaderFn> {
    const storage = await this.getExtendedCardStorage();
    return storage.toCardReader();
  }

  async getOcgcoreWasmBinary() {
    const storage = await this.getStandardCardStorage();
    return storage.ocgcoreWasmBinary;
  }

  async loadYGOProCdbs() {
    await this.loadStandardCdbs();
    if (this.hasExtraFolderPaths) {
      await this.loadExtendedCdbs();
    }
  }

  private async loadStandardCdbs(): Promise<CardStorage> {
    if (this.standardLoadingPromise) {
      return this.standardLoadingPromise;
    }
    const loading = this.loadingLock.acquire(async () => {
      const { cardStorage, sha512 } = await this.loadCardStorageFromPaths(this.ygoproPaths, "standard");
      this.standardCardStorage = cardStorage;
      this.standardSha512 = sha512;
      return cardStorage;
    });
    this.standardLoadingPromise = loading;
    try {
      return await loading;
    } finally {
      if (this.standardLoadingPromise === loading) {
        this.standardLoadingPromise = undefined;
      }
    }
  }

  private async loadExtendedCdbs(): Promise<CardStorage> {
    if (this.extendedLoadingPromise) {
      return this.extendedLoadingPromise;
    }
    const loading = this.loadingLock.acquire(async () => {
      const allPaths = [...this.ygoproPaths, ...this.extraFolderPaths];
      const { cardStorage, sha512 } = await this.loadCardStorageFromPaths(allPaths, "extended");
      this.extendedCardStorage = cardStorage;
      this.extendedSha512 = sha512;
      return cardStorage;
    });
    this.extendedLoadingPromise = loading;
    try {
      return await loading;
    } finally {
      if (this.extendedLoadingPromise === loading) {
        this.extendedLoadingPromise = undefined;
      }
    }
  }

  private registerReloadTimer() {
    if (this.reloadTimerRegistered) {
      return;
    }
    this.reloadTimerRegistered = true;
    setInterval(() => {
      this.reloadIfChanged().catch((error) => {
        this.logger.error("Failed reloading card storage by periodic refresh");
        this.logger.error(error);
      });
    }, CARD_STORAGE_RELOAD_INTERVAL_MS);
  }

  private async reloadIfChanged() {
    await this.reloadStorageIfChanged(
      this.ygoproPaths,
      "standard",
      this.standardCardStorage,
      this.standardSha512,
      (storage, sha512) => {
        this.standardCardStorage = storage;
        this.standardSha512 = sha512;
      },
    );

    if (this.hasExtraFolderPaths) {
      const allPaths = [...this.ygoproPaths, ...this.extraFolderPaths];
      await this.reloadStorageIfChanged(
        allPaths,
        "extended",
        this.extendedCardStorage,
        this.extendedSha512,
        (storage, sha512) => {
          this.extendedCardStorage = storage;
          this.extendedSha512 = sha512;
        },
      );
    }
  }

  private async reloadStorageIfChanged(
    paths: string[],
    label: string,
    currentStorage: CardStorage | undefined,
    currentSha512: Buffer | undefined,
    setter: (storage: CardStorage, sha512: Buffer) => void,
  ) {
    if (!currentStorage) {
      return;
    }
    await this.loadingLock.acquire(async () => {
      const { cardStorage, sha512 } = await this.loadCardStorageFromPaths(paths, label);
      if (currentSha512?.equals(sha512)) {
        this.logger.debug(`Card storage (${label}) hash unchanged, keeping current data`);
        return;
      }
      setter(cardStorage, sha512);
      this.logger.info(`Card storage (${label}) hash changed, replaced current data`);
    });
  }

  private async loadCardStorageFromPaths(paths: string[], label: string) {
    const ocgcoreWasmPathConfig = "./ocgcore-worker";
    const ocgcoreWasmPath = ocgcoreWasmPathConfig
      ? path.resolve(process.cwd(), ocgcoreWasmPathConfig)
      : undefined;
    const { cardStorage, dbCount, failedFiles, sha512 } = await runInWorker(
      CardLoadWorker,
      (worker) => worker.load(),
      paths,
      ocgcoreWasmPath,
    );

    for (const failedFile of failedFiles) {
      this.logger.error(`Failed to read ${failedFile}`);
    }
    this.logger.info(
      `Merged ${label} database from ${dbCount} databases with ${cardStorage.size} cards`,
    );
    return {
      cardStorage,
      sha512,
    };
  }

  async *getLFLists() {
    for await (const file of searchYGOProResource(...this.ygoproPaths)) {
      const filename = path.basename(file.path);
      if (filename !== "lflist.conf") {
        continue;
      }
      const buf = await file.read();
      const text = Buffer.from(buf).toString("utf-8");
      const lflist = new YGOProLFList().fromText(text);
      for (const item of lflist.items) {
        yield { item, text };
      }
    }
  }

  async logLFLists(): Promise<void> {
    this.logger.info("Loading Forbidden/Limited Lists...");
    let index = 0;
    for await (const { item: lflist } of this.getLFLists()) {
      this.logger.info(`  [${index}] ${lflist.name || "Unnamed"} ${lflist.getHash()}`);
      index++;
    }
    if (index === 0) {
      this.logger.error("No lflist.conf found in ygoproPaths");
    } else {
      this.logger.info(`Total LFLists loaded: ${index}`);
    }
  }
}
