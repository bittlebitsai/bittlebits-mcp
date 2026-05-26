const METRIC_DESCRIPTIONS: Record<string, string> = {
    Authority:    "Demonstrates persuasion, credibility, and evidence-based claims consistently",
    Statistics:   "Includes quantitative statistics rather than qualitative discussion wherever possible",
    Keywords:     "Includes keywords likely to appear in LLM prompts",
    Citations:    "Includes relevant quotes backed by citations",
    Simplicity:   "Writing is simple and easily understood",
    Fluency:      "Content flows with continuity between paragraphs rather than disconnected information",
    Technicality: "Includes technical terms and uncommon words rather than generic phraseology",
};

export function formatScore(data: any): string {
    const metrics: Record<string, any> = data.metrics || {};
    if (!Object.keys(metrics).length) return "No metrics available yet.";
    const lines = [`GEO scores (score_id=${data.id}, scale 0–10)\n`];
    for (const [metric, value] of Object.entries(metrics).sort()) {
        const score = parseFloat(String(value));
        const desc = METRIC_DESCRIPTIONS[metric] ? ` — ${METRIC_DESCRIPTIONS[metric]}` : "";
        lines.push(`${metric} (${isNaN(score) ? value : score.toFixed(1)}/10)${desc}`);
    }
    return lines.join("\n");
}

export function formatUrlContent(data: any): string {
    const original: string = (data.original_markdown || "").trim();
    if (!original) return "No page content available yet.";
    return `## Page content\n\n${original}`;
}

export function formatRewrite(data: any): string {
    const rewritten: string = (data.rewritten_markdown || "").trim();
    const suggestions: any[] = data.suggestions || [];

    const parts: string[] = [
        `## Rewritten content (Bittlebits suggestions applied)\n\n${rewritten}`,
    ];

    if (suggestions.length) {
        const lines: string[] = [`## Suggested changes (${suggestions.length})\n`];
        suggestions.forEach((s, i) => {
            const ref = s.selector || s.stable_id;
            lines.push(`### ${i + 1}. \`${ref}\`${s.tag ? ` (${s.tag})` : ""}`);
            if (s.is_addition) {
                lines.push(`**New content:** ${s.suggested_text}`);
                if (s.location_hint) lines.push(`**Placement:** ${s.location_hint}`);
            } else {
                lines.push(`**Current:** ${s.current_text}`);
                lines.push(`**Suggested:** ${s.suggested_text}`);
            }
            lines.push(`**Rationale:** ${s.rationale}\n`);
        });
        parts.push(lines.join("\n"));
    } else {
        parts.push("## Suggested changes\n\nNo suggestions available.");
    }

    return parts.join("\n\n---\n\n");
}
