"""Fail closed before uploading credential-free qualification evidence."""
import sys,json,re,zipfile,pathlib
secrets=[s.encode() for s in json.load(sys.stdin) if s]
count=0
def scan(data):
    global count
    count+=1
    if any(s in data for s in secrets) or re.search(rb'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',data):
        raise RuntimeError('CREDENTIAL_SCAN_FAILED')
for file in pathlib.Path(sys.argv[1]).rglob('*'):
    if not file.is_file():continue
    scan(file.read_bytes())
    if file.suffix=='.zip':
        with zipfile.ZipFile(file) as archive:
            for name in archive.namelist():scan(archive.read(name))
print(json.dumps({'artifactCredentialScan':'PASS','resources':count}))
