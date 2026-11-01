"""Official Porkbun PKCE authorization; no credentials or raw responses in output."""
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, HTTPRedirectHandler, build_opener

API = "https://api.porkbun.com/api/json/v3"
DOMAIN = "truckcontrolai.com"
PRIVATE = Path("/workspace/.truckcontrol-private/porkbun")
PENDING = PRIVATE / "pending.json"
CREDENTIAL = PRIVATE / "credentials.json"

class SetupError(Exception):
    pass

class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def private_directory():
    parent = PRIVATE.parent
    for p in (parent, PRIVATE):
        if not p.exists():
            p.mkdir(mode=0o700)
        info = p.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise SetupError("private_store_permissions")

def read_private(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 32768:
        raise SetupError("private_store_permissions")
    return json.loads(path.read_text())

def write_private(path, value):
    temp = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(value, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temp, path)

def post(suffix, body):
    if suffix not in ("/apikey/request", "/apikey/retrieve", "/ping"):
        raise SetupError("endpoint_not_allowed")
    request = Request(API + suffix, data=json.dumps(body).encode(), method="POST",
                      headers={"Content-Type": "application/json", "User-Agent": "TruckControl official DNS authorization"})
    try:
        with build_opener(NoRedirects()).open(request, timeout=25) as response:
            data = response.read(32769)
        if len(data) > 32768:
            raise SetupError("unexpected_response_size")
        return json.loads(data)
    except HTTPError as exc:
        try:
            result = json.loads(exc.read(32768))
            code = result.get("code", "")
        except (ValueError, AttributeError):
            code = ""
        safe_code = code if isinstance(code, str) and all(c.isupper() or c.isdigit() or c == "_" for c in code) else ""
        raise SetupError("provider_http_%s%s" % (exc.code, ":" + safe_code if safe_code else "")) from None
    except (URLError, ValueError, TimeoutError):
        raise SetupError("provider_connection_unverified") from None

def expiration(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=dt.timezone.utc)

def public_pending(value):
    parsed = urlsplit(value["auth_url"])
    if parsed.scheme != "https" or parsed.netloc != "porkbun.com" or not parsed.path.startswith("/account/apiKeyApproval/"):
        raise SetupError("unexpected_authorization_url")
    return {"status": "awaiting_owner_approval", "auth_url": value["auth_url"],
            "expires_at": value["expires_at"], "requested_scopes": ["dns"],
            "application_name": "TruckControl AI - DNS truckcontrolai.com (sin compras)",
            "intended_domain": DOMAIN, "purchase_permission_requested": False}

def start():
    if CREDENTIAL.exists():
        return {"status": "credential_already_stored", "request_not_repeated": True}
    if PENDING.exists():
        previous = read_private(PENDING)
        if expiration(previous["expires_at"]) > dt.datetime.now(dt.timezone.utc):
            return public_pending(previous)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    result = post("/apikey/request", {"name": "TruckControl AI - DNS truckcontrolai.com (sin compras)",
                                       "codeChallenge": challenge, "codeChallengeMethod": "S256", "scopes": ["dns"]})
    if result.get("status") != "SUCCESS" or result.get("deliveryMode") != "pkce":
        raise SetupError("pkce_request_not_confirmed")
    if not isinstance(result.get("requestToken"), str) or not isinstance(result.get("authUrl"), str):
        raise SetupError("authorization_response_incomplete")
    state = {"request_token": result["requestToken"], "code_verifier": verifier,
             "auth_url": result["authUrl"], "expires_at": result["expiration"], "domain": DOMAIN}
    public = public_pending(state)
    write_private(PENDING, state)
    return public

def poll():
    if CREDENTIAL.exists():
        return {"status": "credential_already_stored", "request_not_repeated": True}
    pending = read_private(PENDING)
    result = post("/apikey/retrieve", {"requestToken": pending["request_token"], "codeVerifier": pending["code_verifier"]})
    if result.get("status") == "PENDING":
        return {"status": "awaiting_owner_approval", "approved": False}
    if result.get("status") != "SUCCESS" or not result.get("apikey") or not result.get("secretapikey"):
        raise SetupError("key_delivery_not_confirmed")
    credentials = {"apikey": result["apikey"], "secretapikey": result["secretapikey"],
                   "domain": DOMAIN, "created_by": "official_porkbun_pkce", "verified": False}
    write_private(CREDENTIAL, credentials)
    return verify()

def verify():
    credentials = read_private(CREDENTIAL)
    if credentials.get("domain") != DOMAIN:
        raise SetupError("domain_mismatch")
    result = post("/ping", {key: credentials[key] for key in ("apikey", "secretapikey")})
    scopes = result.get("scopes")
    if result.get("status") != "SUCCESS" or result.get("credentialsValid") is not True:
        raise SetupError("credentials_not_verified")
    if not isinstance(scopes, list) or "dns" not in scopes or set(scopes) - {"read", "dns"}:
        raise SetupError("unexpected_or_excessive_scopes")
    credentials["verified"] = True
    write_private(CREDENTIAL, credentials)
    return {"status": "connected", "credentials_verified": True, "scopes": scopes,
            "purchase_permission": False, "intended_domain": DOMAIN,
            "provider_domain_restriction_verified": False, "dns_modified": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "poll", "verify"))
    args = parser.parse_args()
    try:
        private_directory()
        value = {"start": start, "poll": poll, "verify": verify}[args.action]()
        print(json.dumps(value, ensure_ascii=False))
        return 0
    except (SetupError, OSError, ValueError, KeyError, TypeError) as exc:
        code = str(exc) if isinstance(exc, SetupError) else "local_authorization_state_unverified"
        print(json.dumps({"status": "not_connected", "error": code}), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
