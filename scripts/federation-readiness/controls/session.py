"""Qualification-only durable admission controller, NOT a federation implementation.

One operator-owned ledger shared by admission adapters. Missing/corrupt/locked
state fails closed. No automatic reinitialization, lease expiry, or budget refund.
A crashed operation remains reserved until inspected. Contains no credentials.
Hosted ingress/model/worker adapters are deliberately NOT claimed by this module.
"""
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager, closing
from pathlib import Path


class Denied(RuntimeError):
    pass


LIMITS = dict(http=2000, submissions=120, concurrency=2, model_concurrency=1,
              model_microusd=5_000_000, artifact_bytes=65536,
              total_artifact_bytes=524288, artifacts=8, duration_seconds=3600,
              active_seconds=2700)


class Session:
    def __init__(self, path, clock=time.time):
        self.path = Path(path)
        self.clock = clock

    def create(self, authorization_reference):
        if not isinstance(authorization_reference, str) or not authorization_reference:
            raise Denied('AUTHORIZATION_REFERENCE_REQUIRED')
        fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        start = self.clock()
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('PRAGMA synchronous=FULL')
            db.execute('CREATE TABLE state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)')
            db.execute('INSERT INTO state VALUES(1,?)', (json.dumps(dict(
                version=1, authorization=authorization_reference, start=start,
                last_clock=start, stopped=False, http=0, submissions=0,
                charged=0, by_component={'myeve': 0, 'peer': 0}, calls={'myeve': 0, 'peer': 0},
                artifact_total=0, artifacts=0, active={}, recent_http=[], events=[])),))
            db.commit()

    @contextmanager
    def transaction(self):
        # mode=rw refuses missing state instead of silently creating a new budget.
        db = sqlite3.connect(self.path.resolve().as_uri()+'?mode=rw', uri=True, timeout=1)
        try:
            db.execute('PRAGMA synchronous=FULL')
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT value FROM state WHERE id=1').fetchone()
            state = json.loads(row[0])
            if state['version'] != 1:
                raise Denied('UNKNOWN_STATE_VERSION')
            yield state
            db.execute('UPDATE state SET value=? WHERE id=1', (json.dumps(state),))
            db.commit()
        finally:
            db.close()

    def admission_time(self, state, cleanup=False):
        now = self.clock()
        if now < state['last_clock']:
            raise Denied('CLOCK_ROLLBACK')
        if state['stopped'] or now >= state['start'] + (3600 if cleanup else 2700):
            raise Denied('SESSION_CLOSED')
        state['last_clock'] = now
        return now

    def admit_http(self, submission=False, cleanup=False):
        if type(submission) is not bool or type(cleanup) is not bool or (cleanup and submission):
            raise Denied('INVALID_CLASSIFICATION')
        with self.transaction() as s:
            now = self.admission_time(s, cleanup)
            recent = [t for t in s['recent_http'] if now-t < 1]
            if s['http'] >= 2000 or (submission and s['submissions'] >= 120):
                raise Denied('REQUEST_LIMIT')
            if sum(a['kind']=='http' for a in s['active'].values()) >= 2:
                raise Denied('HTTP_CONCURRENCY')
            if len(recent) >= 2:
                raise Denied('REQUEST_RATE')
            token = uuid.uuid4().hex
            s['http'] += 1
            s['submissions'] += int(submission)
            s['recent_http'] = recent+[now]
            s['active'][token] = dict(kind='http', at=now)
            s['events'].append(dict(kind='http_admitted',at=now,count=s['http'],submission=submission))
            return token

    def admit_model(self, component, maximum_microusd, liability_reference):
        # Caller must supply a VERIFIED provider hard-cap or mathematical bound,
        # never the existing estimatedCost. No hosted adapter currently supplies it.
        if component not in ('myeve','peer') or type(maximum_microusd) is not int or not 0 < maximum_microusd <= 250_000 or not liability_reference:
            raise Denied('HARD_LIABILITY_BOUND_REQUIRED')
        with self.transaction() as s:
            now = self.admission_time(s)
            if any(a['kind']=='model' for a in s['active'].values()):
                raise Denied('MODEL_CONCURRENCY')
            if s['charged'] >= 4_000_000 or s['charged']+maximum_microusd > 5_000_000:
                raise Denied('MODEL_SPEND_LIMIT')
            cap = 2_000_000 if component=='myeve' else 3_000_000
            if s['by_component'][component]+maximum_microusd > cap or (component=='myeve' and s['calls'][component]>=8):
                raise Denied('COMPONENT_SPEND_LIMIT')
            token=uuid.uuid4().hex
            s['charged']+=maximum_microusd
            s['by_component'][component]+=maximum_microusd
            s['calls'][component]+=1
            s['active'][token]=dict(kind='model',at=now,reserved=maximum_microusd,component=component,deadline=min(now+60,s['start']+2700))
            # Charge full worst-case forever; actual receipts cannot recycle spend.
            s['events'].append(dict(kind='model_reserved',at=now,maximum=maximum_microusd,component=component))
            return token

    def complete(self, token, actual_microusd=None):
        with self.transaction() as s:
            active=s['active'].get(token)
            if active is None:
                raise Denied('UNKNOWN_OR_COMPLETED_OPERATION')
            if active['kind']=='model':
                if type(actual_microusd) is not int or not 0 <= actual_microusd <= active['reserved']:
                    s['stopped']=True
                    s['events'].append(dict(kind='model_liability_uncertain',at=self.clock()))
                    return False  # Keep reservation and model slot fenced.
            del s['active'][token]
            return True

    def artifact(self, chunks):
        # Buffer at most 64 KiB before exposing ANY bytes; ignore Content-Length.
        data=bytearray()
        for chunk in chunks:
            if not isinstance(chunk, bytes) or len(data)+len(chunk)>65536:
                raise Denied('ARTIFACT_SIZE')
            data.extend(chunk)
        with self.transaction() as s:
            now=self.admission_time(s)
            if s['artifacts']>=8 or s['artifact_total']+len(data)>524288:
                raise Denied('ARTIFACT_TOTAL')
            s['artifacts']+=1
            s['artifact_total']+=len(data)
            s['events'].append(dict(kind='artifact_admitted',at=now,bytes=len(data)))
        return bytes(data)

    def stop(self):
        with self.transaction() as s:
            s['stopped']=True
            s['events'].append(dict(kind='stop',at=self.clock()))

    def snapshot(self):
        with self.transaction() as s:
            return s


def emergency_stop(session, controls):
    """Try EVERY independent brake even if another fails. Never emit exception text.

    Adapters must verify the resulting state, not just return an HTTP 200. They
    are supplied by the operator for the immutable synthetic target only. Keep
    out-of-band brakes usable after the test HTTP allowance has been exhausted.
    """
    result={}
    try:
        session.stop()
        result['admissions']='STOPPED'
    except Exception:
        result['admissions']='UNCONFIRMED'
    for name in ('disable_federation','revoke_agent_credentials','revoke_grants',
                 'stop_workers','terminate_execution','freeze_database_logins'):
        try:
            result[name]='VERIFIED' if controls[name]() is True else 'UNCONFIRMED'
        except Exception:
            result[name]='UNCONFIRMED'
    result['complete']=all(v in ('VERIFIED','STOPPED') for v in result.values())
    return result
