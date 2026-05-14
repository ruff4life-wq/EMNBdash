"use client";

import { useCallback, useRef, useState } from "react";
import { isAllowedWorkbookFile } from "./importDropZoneStrings";

type DropZoneProps = {
  disabled?: boolean;
  onFileAccepted: (file: File) => void;
  onValidationError: (message: string) => void;
  label?: string;
};

export function DropZone({ disabled, onFileAccepted, onValidationError, label }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const check = isAllowedWorkbookFile(file);
      if (!check.ok) {
        onValidationError(check.message);
        return;
      }
      onFileAccepted(file);
    },
    [onFileAccepted, onValidationError],
  );

  return (
    <div className="ops-import">
      <label
        className={`ops-file-drop${isDragging ? " ops-file-drop-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xlsm,.xls"
          disabled={disabled}
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            if (event.target) event.target.value = "";
          }}
        />
        <span>{label ?? (disabled ? "Importing..." : "Drop or choose export")}</span>
      </label>
    </div>
  );
}

export function validateWorkbookFileForImport(file: File): string | null {
  const check = isAllowedWorkbookFile(file);
  return check.ok ? null : check.message;
}
