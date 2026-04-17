export const config = {
  redis: {
    use: process.env.USE_REDIS === "true",
    uri: process.env.REDIS_URI,
  },
  env: process.env.NODE_ENV,
  adminApiKey: process.env.ADMIN_API_KEY,
  postgres: {
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432,
  },
  ranking: {
    enabled: process.env.RANK_ENABLED === "true",
  },
  season: Number(process.env.SEASON),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") ?? ["*"],
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED === "true",
    limit: Number(process.env.RATE_LIMIT),
    window: Number(process.env.RATE_LIMIT_WINDOW),
  },
  servers: {
    host: {
      port: Number(process.env.HOST_PORT),
    },
    mercury: {
      port: Number(process.env.YGOPRO_PORT),
      wsPort: Number(process.env.YGOPRO_WEBSOCKET_PORT) || 4002,
    },
    http: {
      port: Number(process.env.HTTP_PORT),
    },
    websocket: {
      port: Number(process.env.WEBSOCKET_PORT),
      duelPort: Number(process.env.WEBSOCKET_DUEL_PORT) || 4001,
    },
  },
  resources: {
    ygopro: {
      folders: process.env?.YGOPRO_FOLDERS?.split(",") ?? [],
      extraFolders: process.env?.YGOPRO_EXTRA_FOLDERS?.split(",") ?? [],
      extraScripts: process.env?.YGOPRO_EXTRA_SCRIPTS?.split(",") ?? [],
    }
  },
  sideTimeoutMinutes: Number(process.env.SIDE_TIMEOUT_MINUTES) || 3,
};
