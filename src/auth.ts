export function getAuthToken(): string {
    const key = process.env.BITTLEBITS_API_KEY;
    if (!key) {
        console.error("Error: BITTLEBITS_API_KEY environment variable is not set.");
        console.error("Get your API key at https://bittlebits.ai/settings");
        process.exit(1);
    }
    return key;
}
