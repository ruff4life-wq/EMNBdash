"use client";

import { useMemo, useState } from "react";
import type { AppField } from "@/lib/operations/adapters";
import { normalizeColumnHeaderForMatch } from "@/lib/operations/adapters/generic";
import type { RawSheet } from "@/lib/operations/types";

const REQUIRED_FIELDS: { key: AppField; label: string }[] = [
  { key: "orderDate", label: "Order date" },
  { key: "customerName", label: "Customer" },
  { key: "menuItem", label: "Menu item" },
  { key: "quantitySold", label: "Quantity" },
  { key: "grossRevenue", label: "Gross revenue" },
];

const OPTIONAL_FIELDS: { key: AppField; label: string }[] = [
  { key: "netNetPayout", label: "Net / payout (optional)" },
  { key: "doorDashFees", label: "Platform fees (optional)" },
];

const ALL_MODAL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

export type MappingModalPayload = {
  detectedColumns: string[];
  bestGuess: Record<AppField, string>;
  fingerprint: string;
  rawSheets: RawSheet[];
};

type MappingModalProps = {
  open: boolean;
  file: File | null;
  payload: MappingModalPayload | null;
  onClose: () => void;
  onImport: (mapping: Partial<Record<AppField, string>>, saveForFingerprint: boolean) => Promise<void>;
};

function firstOperationalSheet(rawSheets: RawSheet[]) {
  return rawSheets.find((s) => s.type === "operational_data") ?? rawSheets[0];
}

function colIndex(headers: string[], selectedHeader: string) {
  if (!selectedHeader.trim()) return -1;
  const t = normalizeColumnHeaderForMatch(selectedHeader);
  return headers.findIndex((h) => normalizeColumnHeaderForMatch(h) === t || h.trim() === selectedHeader.trim());
}

function buildInitialSelection(payload: MappingModalPayload) {
  const next: Partial<Record<AppField, string>> = {};
  for (const { key } of ALL_MODAL_FIELDS) {
    const guess = payload.bestGuess[key] ?? "";
    next[key] = payload.detectedColumns.includes(guess) ? guess : "";
  }
  return next;
}

function MappingModalInner({
  file,
  payload,
  onClose,
  onImport,
}: {
  file: File;
  payload: MappingModalPayload;
  onClose: () => void;
  onImport: (mapping: Partial<Record<AppField, string>>, saveForFingerprint: boolean) => Promise<void>;
}) {
  const [selection, setSelection] = useState(() => buildInitialSelection(payload));
  const [saveMapping, setSaveMapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const sheet = useMemo(() => firstOperationalSheet(payload.rawSheets), [payload.rawSheets]);

  const previewRows = useMemo(() => {
    if (!sheet || sheet.headerRowIndex < 0) return [];
    const out: unknown[][] = [];
    for (let i = sheet.headerRowIndex + 1; i < Math.min(sheet.rows.length, sheet.headerRowIndex + 6); i += 1) {
      out.push(sheet.rows[i] ?? []);
    }
    return out;
  }, [sheet]);

  const previewResolved = useMemo(() => {
    const headers = sheet?.headers ?? [];
    return previewRows.map((row) =>
      ALL_MODAL_FIELDS.map(({ key }) => {
        const h = selection[key];
        if (!h) return "";
        const idx = colIndex(headers, h);
        if (idx < 0) return "";
        return String(row[idx] ?? "").trim();
      }),
    );
  }, [previewRows, selection, sheet]);

  const canSubmit = REQUIRED_FIELDS.every(({ key }) => (selection[key] ?? "").trim() !== "");

  const submit = async () => {
    setLocalError("");
    if (!canSubmit) {
      setLocalError("Map all required columns before importing.");
      return;
    }
    setBusy(true);
    try {
      const mapping: Partial<Record<AppField, string>> = {};
      for (const { key } of ALL_MODAL_FIELDS) {
        const v = selection[key]?.trim();
        if (v) mapping[key] = v;
      }
      await onImport(mapping, saveMapping);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ops-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mapping-modal-title">
      <div className="ops-modal ops-modal-wide">
        <h2 id="mapping-modal-title">Map columns</h2>
        <p className="ops-muted" style={{ marginTop: 0 }}>
          File: <strong>{file.name}</strong> — fingerprint <code>{payload.fingerprint}</code>
        </p>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>1. Detected columns</h3>
          <ul className="ops-muted" style={{ margin: 0, paddingLeft: 18, columns: 2, fontSize: "0.85rem" }}>
            {payload.detectedColumns.map((c, i) => (
              <li key={`${i}-${c}`}>{c || "(blank)"}</li>
            ))}
          </ul>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>2. Field mapping</h3>
          <div className="ops-form-grid">
            {ALL_MODAL_FIELDS.map(({ key, label }) => (
              <label className="ops-field" key={key}>
                <span>
                  {label}
                  {REQUIRED_FIELDS.some((r) => r.key === key) ? " *" : ""}
                </span>
                <select
                  value={selection[key] ?? ""}
                  onChange={(event) => setSelection((prev) => ({ ...prev, [key]: event.target.value }))}
                >
                  <option value="">—</option>
                  {payload.detectedColumns.map((col, i) => (
                    <option key={`${key}-${i}-${col}`} value={col}>
                      {col || "(blank)"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>3. Preview (first 5 data rows)</h3>
          <div className="ops-mapping-preview">
            <table>
              <thead>
                <tr>
                  {ALL_MODAL_FIELDS.map(({ key, label }) => (
                    <th key={key}>{label.replace(" (optional)", "")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewResolved.map((cells, ri) => (
                  <tr key={ri}>
                    {cells.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <label className="ops-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={saveMapping} onChange={(event) => setSaveMapping(event.target.checked)} />
          <span>Save mapping for this fingerprint</span>
        </label>

        {localError ? <p className="ops-error">{localError}</p> : null}

        <div className="ops-actions" style={{ marginTop: 16 }}>
          <button type="button" className="ops-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="ops-primary" onClick={() => void submit()} disabled={busy || !canSubmit}>
            {busy ? "Importing…" : "Import with mapping"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MappingModal({ open, file, payload, onClose, onImport }: MappingModalProps) {
  if (!open || !file || !payload) return null;
  return (
    <MappingModalInner
      key={`${file.name}-${payload.fingerprint}-${file.lastModified}`}
      file={file}
      payload={payload}
      onClose={onClose}
      onImport={onImport}
    />
  );
}
