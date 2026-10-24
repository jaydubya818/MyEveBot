"""Extract actual native partial-start/group-cleanup functions; fake identities,
signals/clock and temporary synthetic registry files. No child/native/PG starts.
"""
import ast
import json
import os
from pathlib import Path
import re
import signal
import stat
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
SOURCE=Path(__file__).with_name('current-native-operator.py').read_text()
TREE=ast.parse(SOURCE)
NAMES=['stop_owned_cluster','cleanup_registered_groups']
ENV={'Path':Path,'json':json,'os':os,'stat':stat,'re':re,'signal':signal}
exec(compile(ast.fix_missing_locations(ast.Module(body=[node for node in TREE.body if isinstance(node,ast.FunctionDef) and node.name in NAMES],type_ignores=[])),'<actual-native-reconciliation>','exec'),ENV)
stop=ENV[NAMES[0]]; cleanup=ENV[NAMES[1]]
EXECUTE=next(node for node in TREE.body if isinstance(node,ast.FunctionDef) and node.name=='execute')
HANDLER=next(node for node in EXECUTE.body if isinstance(node,ast.FunctionDef) and node.name=='interrupted')
WRAPPER=ast.parse('''def handler_fixture(first=None, cleanup_active=False):
 interruption_requested = False
 def snapshot(): return first, interruption_requested
 return interrupted, snapshot
''')
WRAPPER.body[0].body.insert(1,HANDLER)
exec(compile(ast.fix_missing_locations(WRAPPER),'<actual-native-interruption-handler>','exec'),ENV)
class CleanupInterruption(unittest.TestCase):
 def test_first_signal_before_cleanup_is_primary_failure(self):
  handler,snapshot=ENV['handler_fixture']()
  with self.assertRaisesRegex(RuntimeError,'OWNED_OPERATOR_INTERRUPTED'):handler(signal.SIGTERM,None)
  self.assertTrue(snapshot()[1])
 def test_repeated_signal_does_not_abort_unwinding(self):
  handler,snapshot=ENV['handler_fixture']()
  with self.assertRaises(RuntimeError):handler(signal.SIGTERM,None)
  handler(signal.SIGTERM,None);handler(signal.SIGINT,None);self.assertTrue(snapshot()[1])
 def test_first_signal_during_cleanup_records_failure_without_aborting_owned_cleanup(self):
  handler,snapshot=ENV['handler_fixture'](cleanup_active=True)
  handler(signal.SIGTERM,None);self.assertEqual(snapshot()[0]['code'],'OWNED_OPERATOR_INTERRUPTED')
  handler(signal.SIGTERM,None);self.assertTrue(snapshot()[1])
 def test_signal_during_cleanup_preserves_the_existing_primary_failure(self):
  original={'stage':'controller','code':'FIRST_FAILURE'}
  handler,snapshot=ENV['handler_fixture'](first=original,cleanup_active=True)
  handler(signal.SIGINT,None);self.assertIs(snapshot()[0],original)
class Data:
 def __init__(self,exists=True):self.present=exists
 def __truediv__(self,_):return self
 def exists(self):return self.present
class PartialStart(unittest.TestCase):
 def fixture(self,exists=True,actual=123,prior=None,started=False,system='owned'):
  data=Data(exists);calls=[]
  def command(args,name):calls.append((args,name));data.present=False
  spec={'data':data,'system_id':'owned','pg_pid':prior,'initialized':True,'start_attempted':True,'started':started,
   'control':lambda _:system,'pid_binding':lambda:actual,'command':command,'pg':{'binaries':{'pg_ctl':{'path':'/owned/pg_ctl'}}}}
  return spec,calls
 def test_partial_start_after_failed_pg_ctl_is_stopped_by_exact_owned_identity(self):
  s,c=self.fixture();self.assertTrue(stop(**s)['stopped']);self.assertEqual(c[0][1],'pg-stop')
 def test_missing_partial_pid_is_unknown_never_false_stopped(self):
  s,c=self.fixture(exists=False)
  with self.assertRaisesRegex(RuntimeError,'PARTIAL_START'):stop(**s)
  self.assertEqual(c,[])
 def test_changed_original_pid_is_never_stopped(self):
  s,c=self.fixture(actual=456,prior=123,started=True)
  with self.assertRaises(AssertionError):stop(**s)
  self.assertEqual(c,[])
 def test_foreign_control_identity_is_never_stopped(self):
  s,c=self.fixture(system='foreign')
  with self.assertRaises(AssertionError):stop(**s)
  self.assertEqual(c,[])
 def test_initialized_never_started_cluster_has_no_stop_command(self):
  s,c=self.fixture(exists=False);s['start_attempted']=False
  self.assertTrue(stop(**s)['stopped']);self.assertEqual(c,[])
 def test_stop_command_failure_never_returns_stopped(self):
  s,c=self.fixture()
  def fail(*_):raise RuntimeError('stop-failed')
  s['command']=fail
  with self.assertRaisesRegex(RuntimeError,'stop-failed'):stop(**s)
class Registry(unittest.TestCase):
 def harness(self,kind='live',closed=False,killable=True,change_before_kill=False):
  temporary=tempfile.TemporaryDirectory(prefix='synthetic-current-groups-');root=Path(temporary.name).resolve();source=root/'source';source.mkdir()
  row={'event':'OPEN','pid':123,'pgid':123,'start':'Sat Oct 24 04:00:00 2026','commandSha256':'a'*64,'binary':'/owned/node','args':['/owned/entry'],'cwd':str(source)}
  registry=root/'registry.ndjson';rows=[row]
  if closed:rows.append({k:v for k,v in row.items() if k in ['pid','pgid','start','commandSha256']}|{'event':'CLOSED'})
  registry.write_text('\n'.join(json.dumps(x) for x in rows)+'\n');registry.chmod(0o600)
  calls=[];now=[0];live=[kind!='gone'];count=[0]
  def identity(_):
   count[0]+=1
   if kind=='leaderless':return None
   return {'pid':123,'pgid':123,'start':('new-birth' if kind=='reused' or change_before_kill and count[0]>1 else row['start'])}
  def send(pid,sig):
   calls.append((pid,sig))
   if killable or sig==signal.SIGKILL:live[0]=False
  spec={'work_root':root,'binaries':{'/owned/node'},'identity':identity,'group_live':lambda _:live[0],
   'group_signal':send,'sleep':lambda ms:now.__setitem__(0,now[0]+ms)}
  return temporary,registry,spec,calls,now
 def test_controller_loss_stops_the_recorded_detached_group(self):
  t,p,s,c,n=self.harness()
  try:self.assertEqual(cleanup(p,**s)['status'],'OWNED_GROUPS_RECONCILED');self.assertEqual(c,[(123,signal.SIGTERM)])
  finally:t.cleanup()
 def test_reused_pid_never_receives_signal(self):
  t,p,s,c,n=self.harness(kind='reused')
  try:
   with self.assertRaises(BaseExceptionGroup):cleanup(p,**s)
   self.assertEqual(c,[])
  finally:t.cleanup()
 def test_leaderless_unknown_group_retains_hold_without_signal(self):
  t,p,s,c,n=self.harness(kind='leaderless')
  try:
   with self.assertRaises(BaseExceptionGroup):cleanup(p,**s)
   self.assertEqual(c,[])
  finally:t.cleanup()
 def test_closed_record_does_not_kill_reused_foreign_group(self):
  t,p,s,c,n=self.harness(kind='reused',closed=True)
  try:self.assertEqual(cleanup(p,**s)['closedByController'],1);self.assertEqual(c,[])
  finally:t.cleanup()
 def test_matching_unresponsive_leader_has_bounded_term_then_kill(self):
  t,p,s,c,n=self.harness(killable=False)
  try:self.assertEqual(cleanup(p,**s)['status'],'OWNED_GROUPS_RECONCILED');self.assertEqual(c,[(123,signal.SIGTERM),(123,signal.SIGKILL)]);self.assertLessEqual(n[0],11)
  finally:t.cleanup()
 def test_identity_change_before_kill_never_kills_new_process(self):
  t,p,s,c,n=self.harness(killable=False,change_before_kill=True)
  try:
   with self.assertRaises(BaseExceptionGroup):cleanup(p,**s)
   self.assertEqual(c,[(123,signal.SIGTERM)])
  finally:t.cleanup()
 def test_group_already_quiescent_is_not_signaled(self):
  t,p,s,c,n=self.harness(kind='gone')
  try:self.assertEqual(cleanup(p,**s)['status'],'OWNED_GROUPS_RECONCILED');self.assertEqual(c,[])
  finally:t.cleanup()
class RegistryHandle(unittest.TestCase):
 def harness(self,*,initial_type=stat.S_IFREG,held_type=stat.S_IFREG,held_inode=1,changed_handle=False,changed_path=False,short_read=False,read_error=False):
  def metadata(kind=stat.S_IFREG,inode=1):
   return SimpleNamespace(st_mode=kind|0o600,st_uid=41,st_size=3,st_dev=7,st_ino=inode,st_mtime_ns=100,st_ctime_ns=200)
  calls=[];stats=[0];path_stats=[0]
  class FakePath:
   def resolve(self,**_):return self
   def lstat(self):
    path_stats[0]+=1
    return metadata(initial_type,2 if changed_path and path_stats[0]>1 else 1)
  path=FakePath()
  def opened(actual,flags):
   self.assertIs(actual,path)
   self.assertEqual(flags,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
   calls.append('open');return 12
  def fstat(fd):
   self.assertEqual(fd,12);stats[0]+=1
   return metadata(held_type,2 if changed_handle and stats[0]>1 else held_inode)
  def read(fd,count):
   self.assertEqual((fd,count),(12,1024*1024+1));calls.append('read')
   if read_error:raise RuntimeError('synthetic-read-failure')
   return b'{}' if short_read else b'{}\n'
  fake_os=SimpleNamespace(getuid=lambda:41,O_RDONLY=os.O_RDONLY,O_NOFOLLOW=os.O_NOFOLLOW,O_NONBLOCK=os.O_NONBLOCK,
   open=opened,fstat=fstat,read=read,close=lambda fd:calls.append(('close',fd)))
  spec={'work_root':Path('/synthetic'),'binaries':set(),'identity':lambda _:self.fail('identity reached'),
   'group_live':lambda _:self.fail('group probe reached'),'group_signal':lambda *_:self.fail('signal reached'),'sleep':lambda _:self.fail('sleep reached')}
  return path,spec,calls,fake_os
 def test_nonregular_path_metadata_never_opens_reads_or_signals(self):
  for kind in [stat.S_IFIFO,stat.S_IFDIR,stat.S_IFCHR,stat.S_IFBLK,stat.S_IFSOCK,stat.S_IFLNK]:
   with self.subTest(kind=kind):
    p,s,c,o=self.harness(initial_type=kind)
    with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'NOT_REGULAR'):cleanup(p,**s)
    self.assertEqual(c,[])
 def test_raced_fifo_handle_is_nonblocking_and_closed_without_read(self):
  p,s,c,o=self.harness(held_type=stat.S_IFIFO)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'HANDLE_NOT_REGULAR'):cleanup(p,**s)
  self.assertEqual(c,['open',('close',12)])
 def test_replaced_regular_handle_is_closed_without_read(self):
  p,s,c,o=self.harness(held_inode=2)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'REPLACED'):cleanup(p,**s)
  self.assertEqual(c,['open',('close',12)])
 def test_handle_changed_during_read_is_rejected_before_parsing(self):
  p,s,c,o=self.harness(changed_handle=True)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'CHANGED'):cleanup(p,**s)
  self.assertEqual(c,['open','read',('close',12)])
 def test_path_changed_during_read_is_rejected_before_parsing(self):
  p,s,c,o=self.harness(changed_path=True)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'CHANGED'):cleanup(p,**s)
  self.assertEqual(c,['open','read',('close',12)])
 def test_short_regular_read_is_rejected_without_process_observation(self):
  p,s,c,o=self.harness(short_read=True)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(AssertionError,'READ_INCOMPLETE'):cleanup(p,**s)
  self.assertEqual(c,['open','read',('close',12)])
 def test_read_failure_closes_descriptor_and_preserves_first_error(self):
  p,s,c,o=self.harness(read_error=True)
  with patch.dict(ENV,os=o),self.assertRaisesRegex(RuntimeError,'synthetic-read-failure'):cleanup(p,**s)
  self.assertEqual(c,['open','read',('close',12)])
if __name__=='__main__':unittest.main()
