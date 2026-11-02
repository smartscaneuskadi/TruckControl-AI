import { describe, expect, it } from "vitest";
import { createDemo } from "./demo";
import { emptyTyreData } from "../domain/tyres";
import {
  validateBackupRecords,
  collectCompanyBackup,
  validateCompanyBackup,
  encryptCompanyBackup,
  decryptCompanyBackup,
  backupRequiredFeatures,
} from "./company-backup";
import type { CompanyBackupGateway } from "./company-backup";
const fleet = createDemo(),
  org = fleet.organization.id,
  stamp = "2026-01-01T00:00:00Z",
  id = "ed100000-0000-4000-8000-000000000001";
function fixture() {
  const tyre = {
    id,
    organizationId: org,
    data: { ...emptyTyreData, code: "DEMO-1" },
    version: 1,
    updatedAt: stamp,
  };
  const history = {
    id: "ed200000-0000-4000-8000-000000000001",
    organizationId: org,
    tyreId: id,
    data: tyre.data,
    version: 1,
    changedAt: stamp,
  };
  const records = {
    fleet,
    operations: [],
    documents: [],
    invoices: [],
    tyres: [tyre],
    tyreHistory: [history],
  };
  const gateway: CompanyBackupGateway = {
    async authorize() {
      return {
        active: true,
        canManage: true,
        organizationId: org,
        coverage: { documents: "none", invoices: false, tyres: true },
        features: Object.fromEntries(
          backupRequiredFeatures.map((f) => [f, true]),
        ),
      };
    },
    async read() {
      return structuredClone(records);
    },
    async download() {
      throw Error("No files");
    },
  };
  return { records, gateway };
}
describe("copia cifrada de neumáticos e historial", () => {
  it("exporta versión 3 y recupera exactamente fichas e historial tras cifrar", async () => {
    const f = fixture(),
      backup = await collectCompanyBackup(f.gateway, org);
    expect(backup.version).toBe(3);
    const text = await encryptCompanyBackup(
      backup,
      "Frase de prueba de cubiertas 2026",
    );
    const recovered = await decryptCompanyBackup(
      text,
      "Frase de prueba de cubiertas 2026",
      org,
    );
    expect(recovered.tyres).toEqual(f.records.tyres);
    expect(recovered.tyreHistory).toEqual(f.records.tyreHistory);
  });
  it("rechaza empresas mezcladas, revisiones incompletas y falsos formatos antiguos", async () => {
    const f = fixture();
    expect(() =>
      validateBackupRecords({ ...f.records, tyreHistory: [] }, org),
    ).toThrow();
    expect(() =>
      validateBackupRecords(
        {
          ...f.records,
          tyres: [
            { ...f.records.tyres[0], organizationId: crypto.randomUUID() },
          ],
        },
        org,
      ),
    ).toThrow();
    const backup = await collectCompanyBackup(f.gateway, org);
    await expect(
      validateCompanyBackup({ ...backup, version: 2 }, org),
    ).rejects.toThrow("versión 3");
    await expect(
      validateCompanyBackup(
        { ...backup, coverage: { ...backup.coverage, tyres: false } },
        org,
      ),
    ).rejects.toThrow();
  });
  it("no descarga una copia si cambia una revisión o el permiso durante la preparación", async () => {
    const f = fixture(),
      original = f.gateway.read;
    let n = 0;
    f.gateway.read = async () => {
      n++;
      const data = await original();
      if (n > 1) {
        data.tyres![0].data.notes = "cambio";
        data.tyreHistory![0].data.notes = "cambio";
      }
      return data;
    };
    await expect(collectCompanyBackup(f.gateway, org)).rejects.toThrow(
      "ha cambiado",
    );
  });
});
