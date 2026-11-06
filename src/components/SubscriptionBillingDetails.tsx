import { Building2, Mail, ReceiptText } from "lucide-react";
import { operator } from "../domain/legal";
import type { Customer } from "../domain/subscriptions";

/** The subscription seller is distinct from companies issuing fleet invoices. */
export function SubscriptionBillingDetails({
  customer,
  automaticInvoicesReady = false,
}: {
  customer?: Pick<Customer, "company_name" | "tax_id" | "address" | "email">;
  automaticInvoicesReady?: boolean;
}) {
  return (
    <section
      className="card subscription-billing-details"
      aria-label="Datos de facturación del servicio"
    >
      <div className="subscription-billing-heading">
        <ReceiptText aria-hidden="true" size={25} />
        <div>
          <p className="eyebrow">FACTURACIÓN DE TRUCKCONTROL AI</p>
          <h2>Datos fiscales del proveedor</h2>
        </div>
      </div>
      <div className="subscription-billing-parties">
        <div>
          <h3>
            <Building2 aria-hidden="true" size={19} /> Proveedor del servicio
          </h3>
          <dl>
            <dt>Razón social</dt>
            <dd>{operator.name}</dd>
            <dt>CIF</dt>
            <dd>{operator.taxId}</dd>
            <dt>Domicilio fiscal</dt>
            <dd>{operator.address}</dd>
            <dt>Contacto</dt>
            <dd>
              <a href={`mailto:${operator.email}`}>
                <Mail aria-hidden="true" size={15} />
                {operator.email}
              </a>
            </dd>
          </dl>
        </div>
        {customer && (
          <div>
            <h3>Tu empresa</h3>
            <dl>
              <dt>Razón social</dt>
              <dd>{customer.company_name || "Sin completar"}</dd>
              <dt>NIF / CIF</dt>
              <dd>{customer.tax_id || "Sin completar"}</dd>
              <dt>Domicilio fiscal</dt>
              <dd>{customer.address || "Sin completar"}</dd>
              <dt>Correo de la cuenta</dt>
              <dd>{customer.email}</dd>
            </dl>
            <p>Revisa los datos de tu empresa antes de contratar.</p>
          </div>
        )}
      </div>
      {customer && !automaticInvoicesReady && (
        <p className="subscription-billing-pending">
          La contratación estará disponible cuando la emisión y entrega
          automática de facturas al cliente esté habilitada. La prueba gratuita
          no genera cargos ni facturas de compra.
        </p>
      )}
    </section>
  );
}
