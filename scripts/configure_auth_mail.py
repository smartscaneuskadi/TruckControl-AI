"""Inspect or prepare hosted TruckControl Auth; never opens customer registration.

Credentials are supplied by an authorized environment or an explicitly selected
private CLI credential store. No credential or raw remote error is printed.
"""
import argparse
import hashlib
import json
import os
import stat
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PROJECT_REF = "kkkemaycedexymrpaqtp"
ORGANIZATION_ID = "wlvawqxuflbiabowjpkx"
APP_ORIGIN = "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site"
ROOT = Path(__file__).resolve().parents[1]
SUBJECTS = {
    "confirmation": "Confirma tu cuenta de TruckControl AI",
    "recovery": "Recupera tu acceso a TruckControl AI",
}


class SetupError(Exception):
    pass


def check_project(project_ref):
    if project_ref != PROJECT_REF:
        raise SetupError("Destino rechazado: solo se permite el proyecto independiente truckcontrol-ai.")


def load_templates():
    result = {}
    for name in SUBJECTS:
        content = (ROOT / "supabase" / "templates" / (name + ".html")).read_text()
        if "{{ .ConfirmationURL }}" not in content:
            raise SetupError("La plantilla no contiene el enlace de confirmación generado por Auth.")
        result[name] = content
    return result


def build_patch(current):
    redirects = [v.strip() for v in (current.get("uri_allow_list") or "").split(",") if v.strip()]
    for value in redirects + [current.get("site_url") or APP_ORIGIN]:
        parsed = urlsplit(value)
        local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
        ours = parsed.scheme == "https" and parsed.netloc == urlsplit(APP_ORIGIN).netloc
        if not (local or ours) or parsed.username or parsed.password or any(c in value for c in ("*", "?", "#", "\r", "\n")):
            raise SetupError("Hay redirecciones de otra aplicación o ambiguas; se conservan sin modificar hasta revisarlas.")
    patch = {
        "site_url": APP_ORIGIN,
        "uri_allow_list": ",".join(dict.fromkeys(redirects + [APP_ORIGIN + "/"])),
        "mailer_autoconfirm": False,
    }
    if "external_email_enabled" in current:
        patch["external_email_enabled"] = True
    if "password_min_length" in current:
        patch["password_min_length"] = max(int(current["password_min_length"] or 0), 12)
    # New Free projects cannot customize default-SMTP templates. Preserve SMTP
    # and all credentials; apply branded templates only after custom SMTP exists.
    if current.get("smtp_host"):
        for name, content in load_templates().items():
            patch["mailer_subjects_" + name] = SUBJECTS[name]
            patch["mailer_templates_" + name + "_content"] = content
    return patch


def public_status(config):
    return {
        "project_ref": PROJECT_REF,
        "site_url": config.get("site_url"),
        "email_confirmation_required": config.get("mailer_autoconfirm") is False,
        "custom_smtp_configured": bool(config.get("smtp_host")),
        "smtp_host": config.get("smtp_host") or None,
        "sender_address": config.get("smtp_admin_email") or None,
        "sender_name": config.get("smtp_sender_name") or None,
        "smtp_username_present": bool(config.get("smtp_user")),
        "smtp_password_present": bool(config.get("smtp_pass")),
    }


def credential(selector=None):
    value = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not value and selector:
        path = Path(selector)
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 4096:
            raise SetupError("El almacén de autorización debe ser un archivo privado del usuario actual.")
        value = path.read_text().strip()
    if not value or any(c in value for c in ("\r", "\n")):
        raise SetupError("Falta completar la autorización oficial de administración de Supabase.")
    return value


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ManagementClient:
    def __init__(self, authorization):
        self.authorization = authorization
        self.opener = build_opener(NoRedirects())

    def request(self, method, suffix="", body=None):
        url = "https://api.supabase.com/v1/projects/" + PROJECT_REF + suffix
        request = Request(url, data=None if body is None else json.dumps(body).encode(), method=method,
                          headers={"Authorization": "Bearer " + self.authorization, "Content-Type": "application/json", "User-Agent": "TruckControl-Auth-Setup"})
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as e:
            raise SetupError("Supabase ha rechazado la operación de correo (HTTP %s). No se muestran datos sensibles." % e.code) from None
        except (URLError, ValueError, TimeoutError):
            raise SetupError("No se ha podido verificar la configuración de correo de Supabase.") from None


def configure(client, apply=False):
    project = client.request("GET")
    if project.get("id") != PROJECT_REF or project.get("name") != "truckcontrol-ai" or project.get("organization_id") != ORGANIZATION_ID:
        raise SetupError("La identidad del proyecto no coincide con TruckControl. No se aplican cambios.")
    current = client.request("GET", "/config/auth")
    patch = build_patch(current)
    if not apply:
        return {"applied": False, "status": public_status(current), "planned_fields": sorted(patch)}
    client.request("PATCH", "/config/auth", patch)
    verified = client.request("GET", "/config/auth")
    if any(verified.get(key) != value for key, value in patch.items()):
        raise SetupError("Supabase no ha confirmado todos los ajustes. La activación no se declara completa.")
    return {"applied": True, "status": public_status(verified), "templates_pending_custom_smtp": not bool(verified.get("smtp_host")), "customer_registration_opened": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--plan", action="store_true", help="Plan local, sin conexión ni credenciales; modo predeterminado.")
    modes.add_argument("--check", action="store_true", help="Comprobar ajustes alojados sin modificarlos.")
    modes.add_argument("--apply", action="store_true", help="Aplicar solo URL, confirmación y plantillas; conservar SMTP y secretos.")
    parser.add_argument("--project-ref", default=PROJECT_REF)
    parser.add_argument("--credential-file", help="Selector del almacén privado creado por la autorización oficial CLI.")
    args = parser.parse_args()
    try:
        check_project(args.project_ref)
        if not args.check and not args.apply:
            templates = load_templates()
            result = {"applied": False, "project_ref": PROJECT_REF, "site_url": APP_ORIGIN,
                      "required_redirect": APP_ORIGIN + "/", "email_confirmation_required": True,
                      "templates": {name: {"subject": SUBJECTS[name], "sha256": hashlib.sha256(value.encode()).hexdigest()} for name, value in templates.items()},
                      "smtp_and_credentials_modified": False, "customer_registration_opened": False}
        else:
            result = configure(ManagementClient(credential(args.credential_file)), apply=args.apply)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (SetupError, OSError) as e:
        message = str(e) if isinstance(e, SetupError) else "No se puede abrir el almacén privado de autorización o las plantillas."
        print(json.dumps({"applied": False, "error": message}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
