export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function makeCsv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(name: string, rows: (string | number)[][]) {
  downloadFile(name, makeCsv(rows), "text/csv;charset=utf-8");
}
