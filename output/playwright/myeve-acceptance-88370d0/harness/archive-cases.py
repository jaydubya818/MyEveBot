from zipfile import ZipFile,ZIP_DEFLATED,ZIP_STORED
from pathlib import Path
import json,hashlib,copy,warnings
warnings.simplefilter('ignore')
root=Path('/tmp/myeve-acceptance-88370d0/evidence');cases=root/'archive-cases';cases.mkdir(exist_ok=True)
with ZipFile(root/'owner-backup.zip') as z:base={n:z.read(n) for n in z.namelist()}
def write(name,entries,extra=[],compression=ZIP_DEFLATED):
 with ZipFile(cases/(name+'.zip'),'w',compression=compression) as z:
  for n,b in entries.items():z.writestr(n,b)
  for n,b in extra:z.writestr(n,b)
def manifestcase(name,fn):
 d=copy.deepcopy(base);m=json.loads(d['manifest.json']);fn(m);d['manifest.json']=json.dumps(m).encode();write(name,d)
write('traversal',base,[('../synthetic.txt',b'test')])
write('duplicate-entry',base,[('data/profile.json',base['data/profile.json'])])
manifestcase('duplicate-domain',lambda m:m['domains'].append(m['domains'][0]))
manifestcase('unsupported-version',lambda m:m.update(version=99))
write('malformed-manifest',{**base,'manifest.json':b'{bad'})
write('integrity-mismatch',{**base,'data/profile.json':b'{}'})
write('entry-limit',base,[(f'extra/{n}.md',b'x') for n in range(70)])
def revised(name,content):
 d=copy.deepcopy(base);path='data/profile.json';d[path]=content;m=json.loads(d['manifest.json']);checks=json.loads(d['checksums.json']);checks[path]=hashlib.sha256(content).hexdigest();d['checksums.json']=json.dumps(checks).encode()
 for p in [path,'checksums.json']:
  h=hashlib.sha256(d[p]).hexdigest();m['checksums'][p]=h
  for f in m['files']:
   if f['path']==p:f.update(bytes=len(d[p]),sha256=h)
 d['manifest.json']=json.dumps(m).encode();write(name,d)
revised('secret-field',json.dumps({'password':'synthetic-acceptance-secret-not-real'}).encode())
revised('compression-bound',json.dumps({'text':'x'*5000000}).encode())
write('oversized',base,[('large.md',b'x'*(26*1024*1024))],ZIP_STORED)
checks=json.loads(base['checksums.json']);bad=[n for n,h in checks.items() if hashlib.sha256(base[n]).hexdigest()!=h]
print('Independent SHA256 verification:',len(checks),'files;',len(bad),'mismatches')
print('Created',len(list(cases.glob('*.zip'))),'bounded synthetic archives')
