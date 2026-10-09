import concurrent.futures
import tempfile
import unittest
from pathlib import Path
from session import Session, Denied, emergency_stop


def race_admit(path):
    try:
        Session(path).admit_http()
        return True
    except Exception:
        return False


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.now=1000.0
        self.path=Path(self.tmp.name)/'ledger.db'
        self.s=Session(self.path,lambda:self.now)
        self.s.create('local-test-only')

    def test_missing_corrupt_state_and_duplicate_initialization_fail_closed(self):
        with self.assertRaises(Exception): Session(self.path.parent/'missing').admit_http()
        with self.assertRaises(FileExistsError): self.s.create('no-reset')
        self.path.write_bytes(b'corrupt')
        with self.assertRaises(Exception): self.s.admit_http()

    def test_120_submissions_and_denials_consume_admitted_attempts(self):
        for _ in range(120):
            self.s.complete(self.s.admit_http(submission=True));self.now+=1
        with self.assertRaises(Denied):self.s.admit_http(submission=True)
        self.s.complete(self.s.admit_http())
        self.assertEqual(self.s.snapshot()['submissions'],120)

    def test_2000_http_including_retries_and_health(self):
        for _ in range(2000):
            self.s.complete(self.s.admit_http());self.now+=1
        with self.assertRaises(Denied):self.s.admit_http()
        self.assertEqual(self.s.snapshot()['http'],2000)

    def test_two_inflight_and_rolling_rate(self):
        a=self.s.admit_http();b=self.s.admit_http()
        with self.assertRaises(Denied):self.s.admit_http()
        self.s.complete(a)
        with self.assertRaises(Denied):self.s.admit_http()
        self.now+=1
        self.s.admit_http()
        self.s.complete(b)

    def test_model_unknown_cost_keeps_fence_and_stops(self):
        with self.assertRaises(Denied):self.s.admit_model('myeve',250000,None)
        a=self.s.admit_model('myeve',250000,'test-provider-bound')
        with self.assertRaises(Denied):self.s.admit_model('peer',250000,'test-bound')
        self.assertFalse(self.s.complete(a))
        self.assertTrue(self.s.snapshot()['stopped'])
        self.assertIn(a,self.s.snapshot()['active'])

    def test_spend_reserved_no_refund_and_80_percent_cutoff(self):
        for component in ['myeve']*8+['peer']*8:
            self.s.complete(self.s.admit_model(component,250000,'test-bound'),actual_microusd=1)
        self.assertEqual(self.s.snapshot()['charged'],4_000_000)
        with self.assertRaises(Denied):self.s.admit_model('peer',1,'test-bound')

    def test_component_cap_and_invalid_numeric_input(self):
        for value in (-1,0,True,float('nan'),250001):
            with self.assertRaises(Denied):self.s.admit_model('myeve',value,'test-bound')
        for _ in range(8):self.s.complete(self.s.admit_model('myeve',250000,'test-bound'),0)
        with self.assertRaises(Denied):self.s.admit_model('myeve',1,'test-bound')

    def test_deadline_cleanup_and_clock_rollback(self):
        self.now=1001;self.s.complete(self.s.admit_http())
        self.now=1000
        with self.assertRaises(Denied):self.s.admit_http()
        self.now=3700
        with self.assertRaises(Denied):self.s.admit_http()
        self.s.complete(self.s.admit_http(cleanup=True))
        self.now=4600
        with self.assertRaises(Denied):self.s.admit_http(cleanup=True)

    def test_artifact_actual_bytes_and_aggregate(self):
        with self.assertRaises(Denied):self.s.artifact([b'a'*65536,b'b'])
        self.assertEqual(self.s.snapshot()['artifacts'],0)
        for _ in range(8):self.assertEqual(len(self.s.artifact([b'a'*65536])),65536)
        with self.assertRaises(Denied):self.s.artifact([b'a'])

    def test_restart_does_not_release_crashed_operations(self):
        self.s.admit_http();self.s.admit_http();self.now+=5
        restarted=Session(self.path,lambda:self.now)
        with self.assertRaises(Denied):restarted.admit_http()
        self.assertEqual(restarted.snapshot()['http'],2)

    def test_separate_processes_cannot_oversubscribe(self):
        path=Path(self.tmp.name)/'race.db';Session(path).create('test-race')
        with concurrent.futures.ProcessPoolExecutor(max_workers=8) as pool:
            admitted=list(pool.map(race_admit,[str(path)]*8))
        self.assertEqual(sum(admitted),2)

    def test_emergency_stop_tries_all_brakes_and_reports_partial_failure(self):
        called=[]
        names=('disable_federation','revoke_agent_credentials','revoke_grants','stop_workers','terminate_execution','freeze_database_logins')
        def control(name):
            called.append(name)
            if name=='revoke_grants':raise RuntimeError('secret must never be emitted')
            return True
        result=emergency_stop(self.s,{n:lambda n=n:control(n) for n in names})
        self.assertEqual(called,list(names));self.assertFalse(result['complete'])
        self.assertNotIn('secret',str(result))
        with self.assertRaises(Denied):self.s.admit_http()
        self.assertTrue(emergency_stop(self.s,{n:lambda:True for n in names})['complete'])

if __name__=='__main__':unittest.main()
