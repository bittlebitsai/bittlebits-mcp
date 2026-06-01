/**
 * Local credential store at ~/.bittlebits/config.json.
 *
 * Holds the long-lived Bittlebits API key (and the base URL it was issued
 * against) so the user only has to sign in once. The directory is created
 * 0700 and the file written 0600 — it contains a secret.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
    mkdirSync,
    readFileSync,
    writeFileSync,
    rmSync,
    existsSync,
} from "node:fs";

export interface StoredConfig {
    apiKey?: string;
    baseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".bittlebits");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function configPath(): string {
    return CONFIG_FILE;
}

export function load(): StoredConfig {
    try {
        if (!existsSync(CONFIG_FILE)) return {};
        const raw = readFileSync(CONFIG_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        // A corrupt or unreadable file should never crash the server — treat as empty.
        return {};
    }
}

export function save(config: StoredConfig): void {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
        mode: 0o600,
    });
}

export function clear(): void {
    try {
        rmSync(CONFIG_FILE, { force: true });
    } catch {
        /* ignore */
    }
}
