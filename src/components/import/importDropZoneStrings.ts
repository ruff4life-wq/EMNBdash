/** Pre-parse validation copy (EBSFK Dashboard prompt). */
export const DROPZONE_REJECTED_MIME = "Invalid file type. Only CSV, XLS, XLSX, or XLSM files are allowed.";
export const DROPZONE_REJECTED_SIZE = "File is too large. Maximum size is 10 MB.";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const EXT_OK = /\.(csv|xls|xlsx|xlsm)$/i;

const MIME_OK = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
]);

export function isAllowedWorkbookFile(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: DROPZONE_REJECTED_SIZE };
  if (!EXT_OK.test(file.name)) return { ok: false, message: DROPZONE_REJECTED_MIME };
  const type = (file.type || "").toLowerCase();
  if (!type || type === "application/octet-stream") return { ok: true };
  if (MIME_OK.has(type)) return { ok: true };
  return { ok: false, message: DROPZONE_REJECTED_MIME };
}
