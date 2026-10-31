import type {
  Driver,
  FinanceEntry,
  FleetSnapshot,
  Truck,
} from "../domain/models";
import { shiftMonth } from "../domain/finance";

const demoId = (group: number, index: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const names = [
  "Alex",
  "Nora",
  "Iker",
  "Elena",
  "Jon",
  "Marta",
  "Unai",
  "Lucía",
  "Ander",
  "Paula",
  "Hugo",
  "Ane",
];
const surnames = ["Demo Arrieta", "Demo Molina", "Demo Vidal", "Demo Soto"];
const models = [
  ["Volvo", "FH 500"],
  ["Scania", "R 450"],
  ["Mercedes-Benz", "Actros 1845"],
  ["MAN", "TGX 18.510"],
  ["DAF", "XF 480"],
];
const routes = [
  "Bilbao → Madrid",
  "Vitoria → Barcelona",
  "Donostia → Zaragoza",
  "Bilbao → Valencia",
  "Pamplona → Burdeos",
  "Santander → Valladolid",
];

/** Deterministic, fictitious seed. No external services or real business records. */
export function createDemo(reference = new Date()): FleetSnapshot {
  const month = reference.toISOString().slice(0, 7);
  const dateAfter = (days: number) =>
    new Date(
      Date.UTC(
        reference.getUTCFullYear(),
        reference.getUTCMonth(),
        reference.getUTCDate() + days,
      ),
    )
      .toISOString()
      .slice(0, 10);
  const drivers: Driver[] = Array.from({ length: 46 }, (_, i) => ({
    id: demoId(2, i + 1),
    name: `${names[i % names.length]} ${surnames[Math.floor(i / names.length)]}`,
    email: `conductor${i + 1}@example.com`,
    phone: "",
    license: `DEMO-CE-${String(i + 1).padStart(3, "0")}`,
    licenseExpiresOn: dateAfter(i < 2 ? 12 + i * 7 : 100 + i * 11),
    status: i >= 44 ? "leave" : "active",
  }));
  const trucks: Truck[] = Array.from({ length: 50 }, (_, i) => ({
    id: demoId(3, i + 1),
    plate: `${1200 + i * 13} MTR`,
    brand: models[i % 5][0],
    model: models[i % 5][1],
    year: 2021 + (i % 5),
    odometerKm: 112000 + i * 7300,
    status: i < 38 ? "on_route" : i < 46 ? "available" : "maintenance",
    driverId: i < 44 ? drivers[i].id : null,
    inspectionDueOn: dateAfter(i < 3 ? 5 + i * 6 : 70 + i * 5),
    route: i < 38 ? routes[i % 6] : "",
  }));
  const entries: FinanceEntry[] = [];
  let sequence = 1;
  for (let m = -5; m <= 0; m++) {
    const entryMonth = shiftMonth(month, m);
    for (let i = 0; i < trucks.length; i++) {
      const truckId = trucks[i].id;
      const variation = (i * 37 + (m + 5) * 71) % 800;
      for (let service = 0; service < 2; service++) {
        entries.push({
          id: demoId(4, sequence++),
          truckId,
          kind: "income",
          date: `${entryMonth}-${service ? "18" : "06"}`,
          concept: `Transporte demo · ${routes[(i + service) % 6]}`,
          amountCents: (4850 + variation + service * 230 + m * 70) * 100,
          category: "transport",
          paymentStatus:
            m === 0 && i % 4 === 0 && service === 1 ? "pending" : "paid",
          distanceKm: 2700 + (i % 7) * 180 + service * 110,
        });
      }
      const costs = [
        ["fuel", "Repostaje demo", 2480 + (i % 9) * 83],
        ["payroll", "Personal demo", 2950 + (i % 4) * 100],
        ["tolls", "Peajes demo", 370 + (i % 6) * 25],
        ["insurance", "Seguro demo", 280 + (i % 5) * 30],
        [
          "maintenance",
          "Mantenimiento demo",
          i >= 46 ? 5600 + variation : 350 + (i % 5) * 110,
        ],
      ] as const;
      for (let c = 0; c < costs.length; c++) {
        const [category, concept, euros] = costs[c];
        entries.push({
          id: demoId(4, sequence++),
          truckId,
          kind: "expense",
          date: `${entryMonth}-${String(4 + c * 4).padStart(2, "0")}`,
          concept,
          amountCents: (euros + (m + 5) * 13) * 100,
          category,
          paymentStatus: m === 0 && c === 4 && i % 5 === 0 ? "pending" : "paid",
          distanceKm: 0,
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    organization: { id: demoId(1, 1), name: "Flota de demostración" },
    demoMonth: month,
    trucks,
    drivers,
    entries,
  };
}
