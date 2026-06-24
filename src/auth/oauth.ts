/**
 * Browser-based OAuth 2.1 login against the Bittlebits authorization server.
 *
 * Flow (mirrors the pattern used by other MCP CLIs):
 *   1. Discover endpoints from /.well-known/oauth-authorization-server.
 *   2. Spin up a loopback HTTP server on 127.0.0.1 to catch the redirect.
 *   3. Dynamically register a public client for that exact redirect_uri (DCR).
 *   4. Open the browser to the authorize endpoint with a PKCE challenge.
 *   5. Receive the auth code on the loopback callback, exchange it for an
 *      access token at the token endpoint.
 *
 * The returned access token is short-lived and used only to fetch the user's
 * long-lived API key (see apiKey.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import open from "open";

/** Loopback ports tried in order; the first free one is used. */
const CALLBACK_PORTS = [33418, 41822, 50419, 58234];
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export interface DiscoveryMetadata {
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    code_challenge_methods_supported?: string[];
    scopes_supported?: string[];
}

export interface LoginResult {
    accessToken: string;
    tokenType: string;
    expiresIn?: number;
}

function base64url(buf: Buffer): string {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkce(): { verifier: string; challenge: string } {
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    return { verifier, challenge };
}

export async function discover(baseUrl: string): Promise<DiscoveryMetadata> {
    const url = `${baseUrl}/.well-known/oauth-authorization-server`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
        throw new Error(
            `Could not load OAuth metadata from ${url} (HTTP ${res.status}). ` +
                `Check that BITTLEBITS_BASE_URL points at a Bittlebits instance.`,
        );
    }
    const meta = (await res.json()) as DiscoveryMetadata;
    if (!meta.authorization_endpoint || !meta.token_endpoint) {
        throw new Error(`OAuth metadata at ${url} is missing required endpoints.`);
    }
    return meta;
}

/** Register (or look up) a public client for the given loopback redirect URI. */
async function registerClient(registrationEndpoint: string, redirectUri: string): Promise<string> {
    const res = await fetch(registrationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
            client_name: "Bittlebits CLI",
            redirect_uris: [redirectUri],
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Dynamic client registration failed (HTTP ${res.status}). ${detail}`.trim());
    }
    const data = (await res.json()) as { client_id?: string };
    if (!data.client_id) throw new Error("Registration endpoint did not return a client_id.");
    return data.client_id;
}

/** Start a loopback server on the first available port and return it plus the chosen URL. */
function startCallbackServer(
    onCode: (params: URLSearchParams) => void,
): Promise<{ server: Server; redirectUri: string }> {
    return new Promise((resolve, reject) => {
        const tryPort = (index: number) => {
            if (index >= CALLBACK_PORTS.length) {
                reject(new Error("Could not bind a local callback port for the login flow."));
                return;
            }
            const port = CALLBACK_PORTS[index];
            const server = createServer((req, res) => {
                const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
                if (reqUrl.pathname !== "/callback") {
                    res.writeHead(404).end();
                    return;
                }
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(resultPage(reqUrl.searchParams.has("code")));
                onCode(reqUrl.searchParams);
            });
            server.once("error", (err: NodeJS.ErrnoException) => {
                server.close();
                if (err.code === "EADDRINUSE") tryPort(index + 1);
                else reject(err);
            });
            server.listen(port, "127.0.0.1", () => {
                const actual = (server.address() as AddressInfo).port;
                resolve({ server, redirectUri: `http://127.0.0.1:${actual}/callback` });
            });
        };
        tryPort(0);
    });
}

async function exchangeCode(
    tokenEndpoint: string,
    params: { clientId: string; code: string; verifier: string; redirectUri: string },
): Promise<LoginResult> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: params.clientId,
        code: params.code,
        code_verifier: params.verifier,
        redirect_uri: params.redirectUri,
    });
    const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Token exchange failed (HTTP ${res.status}). ${detail}`.trim());
    }
    const data = (await res.json()) as {
        access_token?: string;
        token_type?: string;
        expires_in?: number;
    };
    if (!data.access_token) throw new Error("Token endpoint did not return an access_token.");
    return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? "Bearer",
        expiresIn: data.expires_in,
    };
}

export interface LoginOptions {
    baseUrl: string;
    /** Called with the authorize URL so the caller can print it as a fallback. */
    onAuthUrl?: (url: string) => void;
}

/** Run the full browser login and return an access token. */
export async function loginInBrowser({ baseUrl, onAuthUrl }: LoginOptions): Promise<LoginResult> {
    const meta = await discover(baseUrl);
    const { verifier, challenge } = generatePkce();
    const state = base64url(randomBytes(16));

    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
        resolveCode = res;
        rejectCode = rej;
    });

    const { server, redirectUri } = await startCallbackServer((qs) => {
        if (qs.get("error")) {
            rejectCode(new Error(`Authorization failed: ${qs.get("error_description") || qs.get("error")}`));
            return;
        }
        if (qs.get("state") !== state) {
            rejectCode(new Error("State mismatch in OAuth callback — aborting for safety."));
            return;
        }
        const code = qs.get("code");
        if (!code) {
            rejectCode(new Error("OAuth callback did not include an authorization code."));
            return;
        }
        resolveCode(code);
    });

    const timeout = setTimeout(
        () => rejectCode(new Error("Login timed out after 5 minutes.")),
        LOGIN_TIMEOUT_MS,
    );

    try {
        const registrationEndpoint = meta.registration_endpoint;
        if (!registrationEndpoint) {
            throw new Error("Authorization server does not advertise a registration endpoint (DCR).");
        }
        const clientId = await registerClient(registrationEndpoint, redirectUri);

        const scope = (meta.scopes_supported ?? ["read"]).join(" ");
        const authUrl = new URL(meta.authorization_endpoint);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("scope", scope);

        onAuthUrl?.(authUrl.toString());
        await open(authUrl.toString()).catch(() => {
            /* If the browser can't be opened, the printed URL is the fallback. */
        });

        const code = await codePromise;
        return await exchangeCode(meta.token_endpoint, { clientId, code, verifier, redirectUri });
    } finally {
        clearTimeout(timeout);
        server.close();
    }
}

function resultPage(success: boolean): string {
    const title = success ? "You're signed in" : "Sign-in failed";
    const message = success
        ? "Bittlebits is connected. You can close this tab and return to your terminal."
        : "Something went wrong. Return to your terminal and try again.";
    const accent = success ? "#10b981" : "#ef4444";
    const icon = success
        ? `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="#10b98120"/>
            <path d="M14 24.5l7 7 13-13" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="#ef444420"/>
            <path d="M16 16l16 16M32 16L16 32" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
           </svg>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  color:#111827;
  min-height:100vh;
  display:flex;align-items:center;justify-content:center;
  background-color:#edfaf5;
  background-image:
    radial-gradient(circle,#0e82c87a 1px,transparent 1px),
    radial-gradient(75% 65% at 12% 45%,#34d39938 0%,transparent 100%),
    radial-gradient(60% 70% at 88% 12%,#3b82f638 0%,transparent 100%);
  background-size:20px 20px,100% 100%,100% 100%;
}
.card{
  text-align:center;max-width:440px;padding:48px 40px;
  background:rgba(255,255,255,0.75);
  backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,0.9);
  border-radius:20px;
  box-shadow:0 4px 32px rgba(0,0,0,0.07);
}
.logo{font-size:11px;font-weight:700;letter-spacing:.12em;color:#9ca3af;margin-bottom:36px;text-transform:uppercase}
.icon{margin-bottom:20px}
h1{font-size:24px;font-weight:700;margin-bottom:10px;color:${accent}}
p{color:#6b7280;line-height:1.65;font-size:15px;max-width:300px;margin:0 auto}
</style></head>
<body><div class="card">
  <div class="logo">Bittlebits MCP</div>
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <p>${message}</p>
</div></body></html>`;
}
