import type { CanonicalField, MappingAudit, MappingMode, PlatformAdapter } from "../types";
import { canonicalFieldHints, levenshtein, normalizeColumnHeaderForMatch } from "./generic";

const requiredFields: CanonicalField[] = ["orderDate", "customerName", "menuItem", "quantitySold", "grossRevenue"];

export const mapColumnsWithAdapter = (
  headers: string[],
  adapter: PlatformAdapter,
): { indexes: Partial<Record<CanonicalField, number>>; audit: MappingAudit[]; mode: MappingMode } => {
  const indexes: Partial<Record<CanonicalField, number>> = {};
  const audit: MappingAudit[] = [];
  const normalizedAdapterMap = new Map(
    Object.entries(adapter.columnMap).map(([source, field]) => [normalizeColumnHeaderForMatch(source), field]),
  );

  headers.forEach((header, index) => {
    const field = normalizedAdapterMap.get(normalizeColumnHeaderForMatch(header));
    if (field && indexes[field] === undefined) {
      indexes[field] = index;
      audit.push({ canonicalField: field, detectedColumn: header, confidence: 1, mode: "auto" });
    }
  });

  for (const [field, hints] of Object.entries(canonicalFieldHints) as [CanonicalField, string[]][]) {
    if (indexes[field] !== undefined) continue;
    const candidates = headers
      .map((header, idx) => {
        const normalizedHeader = normalizeColumnHeaderForMatch(header);
        const score = Math.max(
          ...hints.map((hint) => {
            const normalizedHint = normalizeColumnHeaderForMatch(hint);
            if (normalizedHeader.includes(normalizedHint) || normalizedHint.includes(normalizedHeader)) return 0.9;
            const distance = levenshtein(normalizedHeader, normalizedHint);
            return Math.max(0, 1 - distance / Math.max(normalizedHeader.length, normalizedHint.length, 1));
          }),
        );
        return { header, index: idx, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.score >= 0.55) {
      indexes[field] = best.index;
      audit.push({
        canonicalField: field,
        detectedColumn: best.header,
        confidence: best.score,
        mode: best.score >= 0.75 ? "auto" : "manual",
      });
    }
  }

  const requiresManual = requiredFields.some((field) => {
    const entry = audit.find((item) => item.canonicalField === field);
    return !entry || entry.confidence < 0.75;
  });
  return { indexes, audit, mode: requiresManual ? "manual" : "auto" };
};
