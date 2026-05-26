const BASE_URL = "https://bittlebits.ai";

export const ENDPOINTS = {
    score:   `${BASE_URL}/skewer/mcp/v1/score/`,
    rewrite: `${BASE_URL}/skewer/mcp/v1/rewrite/`,
    url:     `${BASE_URL}/skewer/mcp/v1/url/`,
};

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 40;

export async function pollBittlebits(
    endpoint: string,
    inputUrl: string | undefined,
    urlId: number | undefined,
    bearer: string,
): Promise<any> {
    let resolvedUrlId = urlId;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const fetchUrl = resolvedUrlId
            ? `${endpoint}u:${resolvedUrlId}/`
            : `${endpoint}?input_url=${encodeURIComponent(inputUrl!)}`;
        const res = await fetch(fetchUrl, {
            headers: { Authorization: `Bearer ${bearer}` },
        });
        if (!res.ok) throw new Error(`Bittlebits API error: ${res.status}`);
        const data = await res.json();
        if (res.status === 200) return data;
        if (!resolvedUrlId && data.url_id) resolvedUrlId = data.url_id;
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("Polling timed out — the task is still running. Try again in a moment.");
}
