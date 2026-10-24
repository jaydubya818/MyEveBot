"""Actual extracted command-owner body with fake subprocess/group/clock/files.
No execute(), child process, signal, PG, network, SDK or application is invoked.
"""
import ast
from pathlib import Path
import signal
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).with_name('current-native-operator.py').read_text()
TREE = ast.parse(SOURCE)
EXECUTE = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == 'execute')
COMMAND = next(node for node in EXECUTE.body if isinstance(node, ast.FunctionDef) and node.name == 'command')


class FakePath:
    def __init__(self, size=0): self.size = size
    def __truediv__(self, _): return self
    def open(self, _): return self
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def stat(self): return SimpleNamespace(st_size=self.size)
    def read_text(self): raise AssertionError('Unbounded log read forbidden')
    def read(self, size):
        assert size == 16*1024*1024+1
        assert self.size <= 16*1024*1024, 'Oversized file must be rejected before read'
        return b'synthetic private log'


class TimeoutExpired(Exception): pass


class Harness:
    def __init__(self, code=0, live=False, size=0, killable=True, interrupted=False, delayed_exit=None):
        self.now = 0; self.code = code; self.live = live; self.killable = killable
        self.interrupted = interrupted; self.delayed_exit = delayed_exit; self.signals = []; self.spawns = 0; self.path = FakePath(size)
        child = SimpleNamespace(pid=123)
        child.poll = lambda: self.code
        def wait(timeout):
            if self.code is None: raise TimeoutExpired()
            return self.code
        child.wait = wait
        def spawn(*args, **kwargs):
            self.spawns += 1
            assert kwargs['start_new_session'] is True
            assert kwargs['stdin'] == 'DEVNULL'
            return child
        def sleep(ms):
            self.now += ms
            if self.delayed_exit is not None and self.now >= self.delayed_exit:
                self.live = False; self.code = 0
            if self.interrupted:
                self.interrupted = False
                raise RuntimeError('OWNED_OPERATOR_INTERRUPTED')
        def group_signal(pid, sig):
            assert pid == 123; self.signals.append(sig)
            if self.killable: self.live = False; self.code = -int(sig)
        env = {'private': self.path, 'pg_env': {}, 'time': SimpleNamespace(monotonic=lambda:self.now, sleep=sleep),
               'subprocess': SimpleNamespace(Popen=spawn, DEVNULL='DEVNULL', STDOUT='STDOUT', TimeoutExpired=TimeoutExpired),
               'group_live': lambda pid: self.live, 'group_signal': group_signal, 'signal': signal}
        module = ast.Module(body=[COMMAND], type_ignores=[])
        exec(compile(ast.fix_missing_locations(module), '<actual-native-command-owner>', 'exec'), env)
        self.command = env['command']


class Cases(unittest.TestCase):
    def test_normal_zero_exit(self):
        h = Harness(); self.assertEqual(h.command(['/synthetic'], 'normal'), 'synthetic private log'); self.assertEqual(h.spawns, 1); self.assertEqual(h.signals, [])
    def test_nonzero_exit_not_retried(self):
        h = Harness(code=7)
        with self.assertRaisesRegex(RuntimeError, 'EXIT_7'): h.command(['/synthetic'], 'nonzero')
        self.assertEqual(h.spawns, 1)
    def test_timeout_preserved_after_owned_stop(self):
        h = Harness(code=None, live=True)
        with self.assertRaisesRegex(RuntimeError, 'TIMEOUT'): h.command(['/synthetic'], 'timeout', timeout=0.2)
        self.assertEqual(h.signals, [signal.SIGTERM]); self.assertEqual(h.spawns, 1)
    def test_exited_leader_live_group_is_failure(self):
        h = Harness(code=0, live=True)
        with self.assertRaisesRegex(RuntimeError, 'UNEXPECTED_LIVE_PROCESS_GROUP'): h.command(['/synthetic'], 'descendant')
        self.assertEqual(h.signals, [signal.SIGTERM])
    def test_log_cap_preserved_even_if_cleanup_stops_child(self):
        h = Harness(code=None, live=True, size=16*1024*1024+1)
        with self.assertRaisesRegex(RuntimeError, 'LOG_LIMIT'): h.command(['/synthetic'], 'log')
        self.assertEqual(h.spawns, 1)
    def test_controller_gets_inner_cleanup_grace_before_outer_kill(self):
        h = Harness(code=None, live=True, killable=False, delayed_exit=10)
        with self.assertRaisesRegex(RuntimeError, 'TIMEOUT'): h.command(['/synthetic'], 'controller', timeout=0.2)
        self.assertEqual(h.signals, [signal.SIGTERM]); self.assertLess(h.now, 11)
    def test_fast_exit_oversized_log_never_read_or_accepted(self):
        h = Harness(code=0, live=False, size=16*1024*1024+1)
        with self.assertRaisesRegex(RuntimeError, 'LOG_LIMIT'): h.command(['/synthetic'], 'fast-exit-large')
        self.assertEqual(h.spawns, 1); self.assertEqual(h.signals, [])
    def test_primary_and_unknown_cleanup_both_preserved(self):
        h = Harness(code=None, live=True, killable=False)
        with self.assertRaises(BaseExceptionGroup) as context: h.command(['/synthetic'], 'unknown', timeout=0.2)
        self.assertIn('TIMEOUT', str(context.exception.exceptions[0])); self.assertIn('STOP_UNKNOWN', str(context.exception.exceptions[1]))
        self.assertEqual(h.signals, [signal.SIGTERM, signal.SIGKILL]); self.assertLess(h.now, 10)
    def test_operator_interruption_is_not_success(self):
        h = Harness(code=None, live=True, interrupted=True)
        with self.assertRaisesRegex(RuntimeError, 'OWNED_OPERATOR_INTERRUPTED'): h.command(['/synthetic'], 'interrupt')
        self.assertEqual(h.spawns, 1)


if __name__ == '__main__': unittest.main()
