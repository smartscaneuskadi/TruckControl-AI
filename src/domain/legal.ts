export const legalVersion = "2026-11-01";
export const operator = {
  name: "ELEVADANCOR S.L.",
  taxId: "B02993426",
  address: "Polígono Arzabalza, n.º 50, Tolosa",
  email: "pedidos@smartscaneuskadi.com",
} as const;
export type LegalDocument = "notice" | "privacy" | "terms";
export const legalDocuments: Record<
  LegalDocument,
  { title: string; sections: { title: string; text: string }[] }
> = {
  notice: {
    title: "Aviso legal",
    sections: [
      {
        title: "Titular y contacto",
        text: `TruckControl AI es un servicio de ${operator.name}, CIF ${operator.taxId}, con domicilio en ${operator.address}. Contacto: ${operator.email}.`,
      },
      {
        title: "Objeto del servicio",
        text: "La plataforma permite gestionar datos de flotas introducidos o autorizados por cada empresa. Las imágenes de camiones son ilustrativas. Las marcas de fabricantes pertenecen a sus titulares y no implican patrocinio. No se ofrece telemetría GPS ni velocidad real sin una integración expresamente conectada.",
      },
      {
        title: "Uso responsable",
        text: "Cada usuario debe proteger su acceso y utilizar únicamente datos y documentos que esté autorizado a tratar. No está permitido acceder a otras empresas, introducir código malicioso ni utilizar el servicio para actividades ilícitas.",
      },
      {
        title: "Comunicaciones",
        text: `Las consultas sobre el servicio, facturación, seguridad y derechos se atienden en ${operator.email}. Esta información no sustituye las obligaciones legales propias de cada empresa cliente.`,
      },
    ],
  },
  privacy: {
    title: "Privacidad y tratamiento de datos",
    sections: [
      {
        title: "Responsable",
        text: `${operator.name}, CIF ${operator.taxId}, ${operator.address}. Para consultas y ejercicio de derechos: ${operator.email}.`,
      },
      {
        title: "Datos y finalidades",
        text: "Se tratan datos de contacto y empresa para registrar y administrar la cuenta; datos de usuarios, vehículos, conductores, operaciones y documentos para prestar las funciones solicitadas; y registros técnicos limitados para seguridad y resolución de incidencias. La base es la prestación del servicio y las medidas solicitadas antes de contratar, las obligaciones legales y el interés legítimo en proteger la plataforma. La IA requiere habilitación y aceptación específica en la cuenta.",
      },
      {
        title: "Datos de tu empresa",
        text: "La empresa cliente es responsable de la información de su personal y terceros que introduce en la plataforma. ELEVADANCOR S.L. actúa como encargado para prestar el servicio según sus instrucciones y estas condiciones, con acceso limitado por empresa y rol. Debes disponer de la base legal e informar a esas personas antes de incorporar sus datos.",
      },
      {
        title: "Proveedores y ubicación",
        text: "Se utiliza Supabase para identidad, base de datos y almacenamiento privado (proyecto eu-west-2, Reino Unido); OpenAI Sites e infraestructura Cloudflare para alojamiento web; Resend para entrega y recepción de correo (dominio receptor en eu-west-1); y OpenAI para las funciones IA que autorices. Los proveedores pueden tratar datos fuera del Espacio Económico Europeo conforme a sus contratos y garantías aplicables. No se promete residencia exclusivamente dentro de la UE. El envío a IA se limita a los documentos y consultas autorizados; desactivar IA no impide completar una factura manualmente.",
      },
      {
        title: "Conservación y devolución",
        text: "Se conserva la información mientras sea necesaria para prestar el servicio, mantener su seguridad y cumplir obligaciones legales. La suspensión no equivale a borrar la empresa. Puedes exportar los datos disponibles en la app y solicitar devolución o supresión al contacto del responsable; se gestionará verificando tu identidad y respetando la información que deba conservarse legalmente y las copias de recuperación.",
      },
      {
        title: "Derechos",
        text: `Puedes solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad cuando correspondan escribiendo a ${operator.email}. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es). Si los datos pertenecen a una empresa cliente, se trasladará la solicitud a esa empresa como responsable.`,
      },
      {
        title: "Almacenamiento en el dispositivo",
        text: "Se utilizan almacenamiento y sesión necesarios para autenticación, preferencias y funcionamiento sin conexión. El usuario debe proteger su dispositivo y cerrar la sesión en equipos compartidos. La demo guarda información ficticia local; no debes introducir en ella datos reales. No se incorpora publicidad ni medición publicitaria en esta versión.",
      },
    ],
  },
  terms: {
    title: "Condiciones del servicio y encargo de tratamiento",
    sections: [
      {
        title: "Prueba y contratación",
        text: "La prueba Full dura diez días desde la verificación y activación de la cuenta. No requiere tarjeta y no genera cargos ni deuda por sí sola. Al terminar, el acceso queda sujeto al plan activado. Los precios, IVA y alcance de cada plan se muestran antes de contratar. Los cobros automáticos permanecen desactivados hasta que exista una pasarela y se acepte expresamente la contratación y renovación.",
      },
      {
        title: "Cuenta, empresas y permisos",
        text: "La persona que registra una empresa declara estar autorizada para representarla y facilitar datos correctos. Cada empresa dispone de datos y permisos independientes; su administrador gestiona a sus usuarios. El titular de la plataforma puede suspender cuentas por incumplimiento, seguridad o vencimiento, manteniendo las vías de contacto y ejercicio de derechos.",
      },
      {
        title: "Documentos e inteligencia artificial",
        text: "Los documentos recibidos se mantienen pendientes de revisión. Ningún correo o resultado IA acredita por sí mismo una factura ni contabiliza automáticamente un gasto. El cliente debe comprobar los importes y conservar la documentación legal. La IA puede cometer errores y está sujeta a autorización, cuotas y disponibilidad del proveedor; no sustituye asesoramiento profesional.",
      },
      {
        title: "Objeto e instrucciones del encargo",
        text: "El encargo comprende alojamiento, organización, consulta, recuperación y devolución de datos de contacto, empleados, conductores, vehículos, actividad y documentos que el cliente incorpore durante la prestación. Se tratarán solo para ese servicio y conforme a las instrucciones documentadas del cliente; las instrucciones incompatibles con la normativa se comunicarán antes de ejecutarlas.",
      },
      {
        title: "Confidencialidad y seguridad",
        text: "Se limita el acceso al personal y proveedores autorizados sujetos a confidencialidad. Se aplican separación por empresa, permisos por rol, cifrado en tránsito, almacenamiento privado y registros de seguridad. Se prestará asistencia razonable al cliente en derechos, incidentes, evaluaciones y comprobaciones del tratamiento, atendiendo a su naturaleza y a la información disponible.",
      },
      {
        title: "Subencargados y transferencias",
        text: "El cliente autoriza para las funciones contratadas los proveedores identificados en Privacidad: Supabase, OpenAI Sites, Cloudflare, Resend y, al activar IA, OpenAI. Se aplicarán obligaciones contractuales de protección y garantías de transferencia cuando sean necesarias. Los cambios relevantes se comunicarán al cliente, que podrá plantear objeciones motivadas y solicitar alternativas o la terminación del servicio si no pueden resolverse.",
      },
      {
        title: "Incidentes y fin del servicio",
        text: `Los incidentes que afecten a datos de clientes se comunicarán sin dilación indebida cuando se conozcan, con la información disponible. Al terminar, el cliente puede solicitar devolución o supresión a ${operator.email}; se preservarán solo obligaciones legales y copias de recuperación durante su ciclo de conservación, sin uso operativo adicional.`,
      },
      {
        title: "Soporte y límites",
        text: "El servicio depende de la conexión y disponibilidad de sus proveedores. Las funciones no conectadas y las verificaciones pendientes se indican en la app; no se garantiza telemetría, envío ilimitado, funcionamiento continuo ni recuperación instantánea. El servicio se destina a empresas y profesionales y se rige por la normativa española y europea aplicable, sin excluir responsabilidades ni derechos imperativos.",
      },
    ],
  },
};
