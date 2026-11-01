import { FileCheck2, FileInput, LockKeyhole, Mail } from "lucide-react";

export function GmailConnectionGuide() {
  return (
    <section className="card gmail-guide" aria-labelledby="gmail-guide-heading">
      <div className="gmail-guide-title">
        <Mail size={23} aria-hidden="true" />
        <div>
          <h2 id="gmail-guide-heading">Tu correo, conectado a tu empresa</h2>
          <p>
            Gmail y Google Workspace. Sin compartir tu contraseña con
            TruckControl.
          </p>
        </div>
      </div>
      <ol className="gmail-steps">
        <li>
          <Mail size={22} aria-hidden="true" />
          <strong>1. Autoriza tu cuenta</strong>
          <p>
            El administrador de tu empresa elige su Gmail. Google pide permiso y
            te devuelve a esta misma empresa.
          </p>
        </li>
        <li>
          <FileInput size={22} aria-hidden="true" />
          <strong>2. Importa tus facturas</strong>
          <p>
            Se buscan correos con adjuntos de facturas de los últimos 30 días.
            Los documentos quedan pendientes de revisión.
          </p>
        </li>
        <li>
          <FileCheck2 size={22} aria-hidden="true" />
          <strong>3. Revisa y registra</strong>
          <p>
            Comprueba proveedor, fecha, importe y camión. Solo al confirmar se
            registra el gasto, sin duplicarlo.
          </p>
        </li>
      </ol>
      <div className="gmail-privacy-note">
        <LockKeyhole size={18} aria-hidden="true" />
        <p>
          Google concede acceso de solo lectura al buzón. TruckControl usa ese
          acceso para buscar facturas e importar sus adjuntos; no envía correos
          ni cambia mensajes. La IA es opcional y conectar Gmail no la activa.
        </p>
      </div>
    </section>
  );
}
