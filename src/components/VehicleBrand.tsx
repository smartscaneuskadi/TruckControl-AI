import { Truck } from "lucide-react";

const makers = [
  { id: "scania", name: "Scania", image: "/brands/scania.svg" },
  {
    id: "mercedes-benz",
    name: "Mercedes-Benz",
    image: "/brands/mercedes-benz.svg",
  },
  { id: "man", name: "MAN", image: "/brands/man.webp" },
] as const;

function makerFor(brand: string) {
  const normalized = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  return makers.find((maker) =>
    maker.id === "mercedes-benz"
      ? normalized === "mercedesbenz" || normalized === "mercedes"
      : normalized === maker.id,
  );
}

/** Local manufacturer artwork identifies the vehicle; it never loads a third-party tracker. */
export function VehicleBrand({
  brand,
  large = false,
}: {
  brand: string;
  large?: boolean;
}) {
  const maker = makerFor(brand);
  return (
    <span
      className={`vehicle-brand ${maker ? `vehicle-brand--${maker.id}` : "vehicle-brand--other"} ${large ? "vehicle-brand--large" : ""}`}
      aria-hidden="true"
    >
      {maker ? (
        <img src={maker.image} alt="" width={48} height={48} decoding="async" />
      ) : (
        <Truck size={large ? 34 : 22} />
      )}
    </span>
  );
}

export function FleetBrands({ trucks }: { trucks: { brand: string }[] }) {
  const counts = makers.map((maker) => ({
    ...maker,
    count: trucks.filter((truck) => makerFor(truck.brand)?.id === maker.id)
      .length,
  }));
  const other =
    trucks.length - counts.reduce((sum, maker) => sum + maker.count, 0);
  return (
    <section
      className="fleet-manufacturers"
      aria-labelledby="fleet-manufacturers-heading"
    >
      <div className="manufacturers-intro">
        <span className="eyebrow">CONTROL MULTIMARCA</span>
        <h2 id="fleet-manufacturers-heading">Una flota. Una visión.</h2>
        <p>
          {trucks.length} vehículos
          {other > 0 ? ` · ${other} de otras marcas` : " registrados"}
        </p>
      </div>
      <div className="manufacturer-tiles">
        {counts.map((maker) => (
          <div className="manufacturer-tile" key={maker.id}>
            <VehicleBrand brand={maker.name} />
            <div>
              <strong>{maker.name}</strong>
              <span>
                {maker.count} {maker.count === 1 ? "vehículo" : "vehículos"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DemoManufacturers() {
  return (
    <div
      className="hero-manufacturers"
      aria-label="Ejemplos de marcas de la demostración"
    >
      <span>GESTIÓN MULTIMARCA</span>
      <div>
        {makers.map((maker) => (
          <div key={maker.id}>
            <VehicleBrand brand={maker.name} />
            <span>{maker.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
