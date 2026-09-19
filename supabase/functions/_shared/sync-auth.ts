// SHA-256 of the dedicated cron secret. The plaintext is stored only in Vault.
// A digest allows deployment through MCP when CLI secret management is unavailable.
export const SYNC_SECRET_SHA256 = "b2473f43f76f5b3963afe044f11940d24c410df2b27c37a3b366e0098b80301c";
