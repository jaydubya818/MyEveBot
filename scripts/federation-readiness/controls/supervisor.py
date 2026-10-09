"""Bounded process ownership for qualification workers (operator runtime only).
Never uses process-name matching, shell interpolation, or persisted PIDs.
A deployment must additionally fence credentials/DB access after supervisor loss.
"""
import os
import signal
import subprocess
import time


def start_worker(argv, *, cwd, env):
    # Explicit environment prevents inheriting the operator's personal credentials.
    if not argv or not os.path.isabs(argv[0]):
        raise ValueError('Absolute executable required')
    return subprocess.Popen(argv,cwd=cwd,env=env,stdin=subprocess.DEVNULL,
                            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                            start_new_session=True)


def terminate_workers(children, grace_seconds=5):
    # Only live Popen handles created by this supervisor may be passed.
    if not 0 <= grace_seconds <= 5:
        raise ValueError('Grace exceeds stop envelope')
    for child in children:
        if child.poll() is None:
            try:os.killpg(child.pid,signal.SIGTERM)
            except ProcessLookupError:pass
    deadline=time.monotonic()+grace_seconds
    for child in children:
        try:child.wait(timeout=max(0,deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            child.wait(timeout=5)
    return all(child.poll() is not None for child in children)


def watchdog_required_stop(session):
    try:
        state=session.snapshot();now=session.clock()
        return (state['stopped'] or now < state['last_clock']
                or now >= state['start']+3600
                or any(a['kind']=='model' and now>=a['deadline'] for a in state['active'].values()))
    except Exception:
        return True
