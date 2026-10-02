"""Redact authentication material from a locally retained Playwright trace."""
import json, re, sys, zipfile, os
source, destination = sys.argv[1:]
secrets = json.load(sys.stdin)
def redact(value):
    if isinstance(value, dict):
        if str(value.get('name', '')).lower() in ('cookie', 'set-cookie', 'authorization', 'x-vercel-protection-bypass', 'x-vercel-oidc-token'):
            return {**value, 'value': '[REDACTED]'}
        return {k: redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, '[REDACTED]')
        return re.sub(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', '[REDACTED]', value)
    return value
with zipfile.ZipFile(source) as before, zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as after:
    for item in before.infolist():
        data = before.read(item)
        try:
            text = data.decode('utf8')
        except UnicodeDecodeError:
            if any(secret.encode() in data for secret in secrets if secret):
                raise RuntimeError('Credential in binary trace resource')
        else:
            lines = []
            for line in text.splitlines():
                try:
                    lines.append(json.dumps(redact(json.loads(line)), separators=(',', ':')))
                except json.JSONDecodeError:
                    lines.append(redact(line))
            data = ('\n'.join(lines) + ('\n' if text.endswith('\n') else '')).encode()
        if any(secret.encode() in data for secret in secrets if secret):
            raise RuntimeError('Trace credential scan failed')
        after.writestr(item, data)
os.chmod(destination, 0o600)
