import { Pencil } from "lucide-react";
import { useFleet } from "../app/FleetProvider";
import { useWorkspace } from "../app/WorkspaceContext";
import type { Driver } from "../domain/models";
import { date } from "../lib/format";
import { Badge, Button, Modal } from "./ui";
import { EntityDocuments } from "./EntityDocuments";

export function DriverDetail({
  driver,
  onClose,
}: {
  driver: Driver;
  onClose(): void;
}) {
  const { snapshot } = useFleet(),
    { edit, viewTruck } = useWorkspace();
  const trucks = snapshot.trucks.filter(
    (truck) => truck.driverId === driver.id || truck.coDriverId === driver.id,
  );
  return (
    <Modal
      title={`Ficha de ${driver.name}`}
      subtitle="Datos, asignaciones y documentos del conductor."
      onClose={onClose}
      wide
    >
      <div className="detail-section-heading">
        <Badge tone={driver.status === "leave" ? "amber" : "green"}>
          {driver.status === "leave" ? "De permiso" : "Disponible"}
        </Badge>
        <Button
          variant="secondary"
          icon={Pencil}
          onClick={() => {
            onClose();
            edit({ kind: "driver", value: driver });
          }}
        >
          Editar conductor
        </Button>
      </div>
      <div className="driver-detail-facts">
        <div>
          <span>Correo electrónico</span>
          <strong>{driver.email || "Sin correo"}</strong>
        </div>
        <div>
          <span>Teléfono</span>
          <strong>{driver.phone || "Sin teléfono"}</strong>
        </div>
        <div>
          <span>Permiso de conducir</span>
          <strong>{driver.license}</strong>
        </div>
        <div>
          <span>Vencimiento del permiso</span>
          <strong>{date(driver.licenseExpiresOn)}</strong>
        </div>
      </div>
      <div className="detail-section-heading">
        <h3>Vehículos asignados</h3>
      </div>
      {trucks.length ? (
        <div className="access-links">
          {trucks.map((truck) => (
            <Button
              key={truck.id}
              variant="secondary"
              onClick={() => {
                onClose();
                viewTruck(truck);
              }}
            >
              {truck.plate} ·{" "}
              {truck.coDriverId === driver.id
                ? "Segundo conductor"
                : "Conductor principal"}
            </Button>
          ))}
        </div>
      ) : (
        <p className="muted">Sin vehículo asignado.</p>
      )}
      <EntityDocuments
        scope={{ kind: "driver", id: driver.id }}
        defaultCategory="identity"
        title="Documentación del conductor"
      />
    </Modal>
  );
}
