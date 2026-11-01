"""Pinned, DNS-only Porkbun client. Credentials are never logged or included in diagnostics."""
import hashlib
import importlib.util
import json
import re
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("truckcontrol_porkbun_auth", ROOT / "porkbun_authorize.py")
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)
DOMAIN = "truckcontrolai.com"
RECEIVING_HOST_TYPES = {
    "facturas": {"MX", "TXT"},
    "send.facturas": {"MX", "TXT"},
    "resend._domainkey.facturas": {"TXT", "CNAME"},
    "_dmarc.facturas": {"TXT"},
}

def call(method, route, body=None, operation_id=None):
    allowed_read = {"/dns/retrieve/" + DOMAIN, "/dns/history/" + DOMAIN}
    allowed_write = route == "/dns/create/" + DOMAIN or bool(re.fullmatch(r"/dns/(edit)/truckcontrolai\.com/[0-9]+", route))
    if not ((method == "GET" and route in allowed_read) or (method == "POST" and allowed_write)):
        raise auth.SetupError("endpoint_not_allowed")
    if method == "POST":
        if not isinstance(body, dict) or body.get("type") not in {"A", "CNAME", "MX", "TXT", "SRV"}:
            raise auth.SetupError("dns_record_type_not_allowed")
        host = body.get("name")
        if not isinstance(host, str) or host not in {
            "", "www", "_openai-site-verification", "_cf-custom-hostname",
            "_openai-site-verification.www", "_cf-custom-hostname.www",
            "key1._domainkey", "key2._domainkey", "key3._domainkey", "_dmarc", "autoconfig",
            "_autodiscover._tcp", "_submissions._tcp", "_imaps._tcp", "_pop3s._tcp",
        } | set(RECEIVING_HOST_TYPES):
            raise auth.SetupError("dns_hostname_not_allowed")
        if host in RECEIVING_HOST_TYPES and body["type"] not in RECEIVING_HOST_TYPES[host]:
            raise auth.SetupError("receiving_record_type_not_allowed")
    credentials = auth.read_private(auth.CREDENTIAL)
    if credentials.get("domain") != DOMAIN or credentials.get("verified") is not True:
        raise auth.SetupError("unverified_credentials_or_domain")
    headers = {"X-API-Key": credentials["apikey"], "X-Secret-API-Key": credentials["secretapikey"],
               "Content-Type": "application/json", "User-Agent": "TruckControl DNS-only configuration"}
    if method == "POST":
        if not operation_id:
            raise auth.SetupError("idempotency_key_required")
        headers["Idempotency-Key"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "truckcontrol-dns/" + operation_id))
    data = None if body is None else json.dumps(body).encode()
    request = Request(auth.API + route, data=data, method=method, headers=headers)
    try:
        with build_opener(auth.NoRedirects()).open(request, timeout=30) as response:
            raw = response.read(2000001)
        if len(raw) > 2000000:
            raise auth.SetupError("unexpected_response_size")
        result = json.loads(raw)
    except HTTPError as exc:
        try:
            result = json.loads(exc.read(16384))
        except ValueError:
            result = {}
        code = result.get("code", "")
        safe_code = code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]+", code) else ""
        raise auth.SetupError("provider_http_%s%s" % (exc.code, ":" + safe_code if safe_code else "")) from None
    except (URLError, ValueError, TimeoutError):
        raise auth.SetupError("provider_connection_unverified") from None
    if result.get("status") != "SUCCESS":
        code = result.get("code", "")
        safe_code = code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]+", code) else ""
        raise auth.SetupError("provider_operation_unconfirmed" + (":" + safe_code if safe_code else ""))
    return result

def inventory():
    result = call("GET", "/dns/retrieve/" + DOMAIN)
    records = result.get("records")
    if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
        raise auth.SetupError("unexpected_inventory")
    for row in records:
        name = str(row.get("name", "")).rstrip(".").lower()
        if name != DOMAIN and not name.endswith("." + DOMAIN):
            raise auth.SetupError("inventory_domain_mismatch")
    return records

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()
