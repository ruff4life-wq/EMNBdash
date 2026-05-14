"use client";

import { useCallback, useMemo, useState } from "react";
import { getMappingRegistry } from "@/components/import/mappingRegistryClient";
import type { ColumnMapping } from "@/lib/operations/adapters";

export function SavedColumnMappingsCard() {
  const registry = useMemo(() => getMappingRegistry(), []);
  const [rows, setRows] = useState<ColumnMapping[]>(() => registry.list());

  const refresh = useCallback(() => setRows(registry.list()), [registry]);

  const remove = useCallback(
    (id: string) => {
      registry.delete(id);
      refresh();
    },
    [registry, refresh],
  );

  return (
    <section className="ops-panel" style={{ marginBottom: 16 }}>
      <h2>Saved column mappings</h2>
      <p className="ops-muted">Fingerprints auto-apply on future imports of spreadsheets with the same header layout.</p>
      {rows.length === 0 ? (
        <p className="ops-muted">No saved mappings yet.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Fingerprint</th>
                <th>Saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>
                    <code style={{ fontSize: "0.8rem" }}>{row.fingerprint}</code>
                  </td>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>
                    <button type="button" className="ops-danger" onClick={() => remove(row.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
