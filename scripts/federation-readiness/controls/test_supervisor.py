import os
import sys
import tempfile
import unittest
from pathlib import Path
from session import Session
from supervisor import start_worker,terminate_workers,watchdog_required_stop


class SupervisorTests(unittest.TestCase):
    def test_real_process_is_terminated_without_inheriting_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            sentinel=Path(directory)/'ready'
            script="import os,signal,time,pathlib; assert 'HOME' not in os.environ; signal.signal(signal.SIGTERM,signal.SIG_IGN); pathlib.Path('ready').touch(); time.sleep(30)"
            child=start_worker([sys.executable,'-c',script],cwd=directory,env={'PATH':'/usr/bin:/bin'})
            self.addCleanup(lambda:terminate_workers([child],0))
            import time
            deadline=time.monotonic()+3
            while not sentinel.exists() and child.poll() is None and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(sentinel.exists())
            self.assertTrue(terminate_workers([child],.05))
            self.assertIsNotNone(child.returncode)

    def test_watchdog_fails_closed_for_state_loss_and_model_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            now=[1000.0];s=Session(Path(directory)/'session',lambda:now[0])
            self.assertTrue(watchdog_required_stop(s))
            s.create('test');self.assertFalse(watchdog_required_stop(s))
            s.admit_model('myeve',1,'test-liability');now[0]+=60
            self.assertTrue(watchdog_required_stop(s))

    def test_watchdog_session_expiry_and_explicit_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            now=[1000.0];s=Session(Path(directory)/'session',lambda:now[0]);s.create('test')
            now[0]+=3600;self.assertTrue(watchdog_required_stop(s))
            now[0]=1000;s.stop();self.assertTrue(watchdog_required_stop(s))

if __name__=='__main__':unittest.main()
