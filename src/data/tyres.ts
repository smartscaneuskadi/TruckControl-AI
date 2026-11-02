import {
  validateTyreForSave,
  validateTyreArchive,
  validateTyres,
} from "../domain/tyres";
import type { TyreData, TyreRecord, TyreHistory } from "../domain/tyres";
import type { FleetSnapshot } from "../domain/models";
import { validateSnapshot } from "../domain/models";
import { STORAGE_KEY } from "./demo-keys";
import { readDemoTyreArchive } from "./demo-workspace";
const empty = () => ({
  rows: [] as TyreRecord[],
  history: [] as TyreHistory[],
});
export function loadDemoTyres(org: string, fleet?: FleetSnapshot) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return empty();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw Error(
      "La copia local de neumáticos no es válida. Consérvala para revisión.",
    );
  }
  const snapshot = validateSnapshot(data);
  if (snapshot.organization.id !== org)
    throw Error("La demostración pertenece a otra empresa.");
  return readDemoTyreArchive(localStorage, fleet ?? snapshot) ?? empty();
}
export function saveDemoTyre(
  org: string,
  fleet: FleetSnapshot,
  id: string,
  input: TyreData,
  expected: number | null,
) {
  const data = validateTyreForSave(input),
    current = loadDemoTyres(org, fleet),
    old = current.rows.find((t) => t.id === id);
  if (
    old &&
    ((expected === null && old.version === 1) ||
      old.version === expected ||
      old.version === (expected ?? -1) + 1) &&
    JSON.stringify(old.data) === JSON.stringify(data)
  )
    return old;
  if (old ? expected !== old.version : expected !== null)
    throw Error(
      "Otro cambio ha modificado este neumático. Actualiza antes de guardar.",
    );
  const row: TyreRecord = {
    id,
    organizationId: org,
    data,
    version: (old?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  const rows = validateTyres(
    [...current.rows.filter((r) => r.id !== id), row],
    org,
    fleet,
  );
  const history = [
    ...current.history,
    {
      id: crypto.randomUUID(),
      organizationId: org,
      tyreId: id,
      data,
      version: row.version,
      changedAt: row.updatedAt,
    },
  ];
  if (history.length > 50_000)
    throw Error(
      "El historial local supera su límite; conserva una exportación antes de continuar.",
    );
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw Error("No se encuentra la demostración actual.");
  const core = JSON.parse(raw),
    snapshot = validateSnapshot(core);
  if (snapshot.organization.id !== org)
    throw Error("La demostración pertenece a otra empresa.");
  const archive = validateTyreArchive({ rows, history }, org, snapshot);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...core, demoTyresV1: archive }),
  );
  return row;
}
