"""One reviewed platform-specific current-QE attempt, never a historical-gate fallback.
Source preparation only: no native command is run when this module is imported.
The reviewer/root supplies exact plan + clearance hashes before invocation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys
import time
import traceback
from urllib.parse import quote

SHA = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
PROFILE = 'eve-0.66.3-current-qe-public-chat-v1'


def stop_owned_cluster(*, data, system_id, pg_pid, initialized, start_attempted, started, control, pid_binding, command, pg):
    """Attempt cleanup even if pg_ctl failed AFTER starting an owned postmaster.
    An unbound partial start stays UNKNOWN; never signal a discovered foreign PID.
    """
    if not initialized:
        if (data / 'postmaster.pid').exists(): raise RuntimeError('UNINITIALIZED_POSTMASTER_STATE_UNKNOWN')
        return {'stopped': True, 'pid': pg_pid, 'state': 'NO_START_ATTEMPT'}
    assert control('control-before-stop') == system_id
    if start_attempted:
        if not (data / 'postmaster.pid').exists():
            if not started: raise RuntimeError('PARTIAL_START_WITHOUT_BOUND_PID_UNKNOWN')
            return {'stopped': True, 'pid': pg_pid, 'state': 'PREVIOUSLY_BOUND_CLUSTER_HAS_NO_PID'}
        actual = pid_binding()  # validates exact owned data, port, executable command
        if pg_pid is not None: assert actual == pg_pid
        command([pg['binaries']['pg_ctl']['path'], '-D', data, '-m', 'fast', '-t', '30', '-w', 'stop'], 'pg-stop')
        assert not (data / 'postmaster.pid').exists()
        assert control('control-after-stop') == system_id
        return {'stopped': True, 'pid': actual, 'state': 'EXACT_OWNED_POSTMASTER_STOPPED'}
    assert not (data / 'postmaster.pid').exists()
    return {'stopped': True, 'pid': pg_pid, 'state': 'INITIALIZED_NEVER_STARTED'}


def cleanup_registered_groups(path, *, work_root, binaries, identity, group_live, group_signal, sleep):
    """Reconcile the producer's persistent owned-group registry on controller loss.
    Never kill a PID with a changed birth/group or a leaderless unknown group.
    """
    assert path.resolve(strict=True) == path
    meta = path.lstat()
    assert stat.S_ISREG(meta.st_mode), 'OWNED_PROCESS_REGISTRY_NOT_REGULAR'
    assert stat.S_IMODE(meta.st_mode) == 0o600 and meta.st_uid == os.getuid() and meta.st_size <= 1024*1024
    # NONBLOCK also bounds open if the regular pathname is replaced by a FIFO
    # between lstat and open. Never read until the descriptor itself is bound.
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        held = os.fstat(descriptor)
        fields = ('st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        assert stat.S_ISREG(held.st_mode), 'OWNED_PROCESS_REGISTRY_HANDLE_NOT_REGULAR'
        assert all(getattr(held, field) == getattr(meta, field) for field in fields), 'OWNED_PROCESS_REGISTRY_REPLACED'
        body = os.read(descriptor, 1024*1024+1)
        after = os.fstat(descriptor)
        current = path.lstat()
        assert all(getattr(after, field) == getattr(held, field) == getattr(current, field) for field in fields), 'OWNED_PROCESS_REGISTRY_CHANGED'
        assert len(body) == held.st_size <= 1024*1024, 'OWNED_PROCESS_REGISTRY_READ_INCOMPLETE'
    finally:
        os.close(descriptor)
    entries = {}; closed = set()
    rows = body.decode('utf8').splitlines(); assert len(rows) <= 128
    for line in rows:
        assert len(line) <= 16384
        row = json.loads(line); key = (row['pid'], row['start'])
        assert isinstance(row['pid'], int) and row['pid'] > 0 and row['pgid'] == row['pid']
        assert re.fullmatch(r'[a-f0-9]{64}', row['commandSha256'])
        if row['event'] == 'OPEN':
            assert key not in entries and row['binary'] in binaries
            assert Path(row['cwd']).is_relative_to(work_root / 'source')
            assert isinstance(row['args'], list) and all(isinstance(item, str) for item in row['args'])
            entries[key] = row
        else:
            assert row['event'] == 'CLOSED' and key in entries and key not in closed
            assert row['commandSha256'] == entries[key]['commandSha256']; closed.add(key)
    assert entries, 'OWNED_PROCESS_REGISTRY_EMPTY'
    active = [row for key, row in entries.items() if key not in closed]
    assert len(active) <= 3, 'UNEXPECTED_CONCURRENT_OWNED_GROUPS'
    observations = []; errors = []
    for row in active:
        try:
            pid = row['pid']
            if group_live(pid):
                observed = identity(pid)
                assert observed and all(observed[key] == row[key] for key in ['pid', 'pgid', 'start']), 'OWNED_GROUP_IDENTITY_UNKNOWN'
                group_signal(pid, signal.SIGTERM)
                for _ in range(100):
                    if not group_live(pid): break
                    sleep(0.1)
                if group_live(pid):
                    observed = identity(pid)
                    assert observed and all(observed[key] == row[key] for key in ['pid', 'pgid', 'start']), 'OWNED_GROUP_IDENTITY_CHANGED_BEFORE_KILL'
                    group_signal(pid, signal.SIGKILL)
                    for _ in range(30):
                        if not group_live(pid): break
                        sleep(0.1)
                assert not group_live(pid), 'OWNED_GROUP_CLEANUP_UNKNOWN'
            observations.append({'pid': pid, 'start': row['start'], 'groupQuiescent': True})
        except BaseException as error:
            errors.append(error)
    if errors: raise BaseExceptionGroup('Owned group reconciliation incomplete; retain HOLD', errors)
    return {'status': 'OWNED_GROUPS_RECONCILED', 'recorded': len(entries), 'closedByController': len(closed), 'outerStopped': observations}


def execute(plan_path, plan_sha, clearance_path, clearance_sha):
    os.umask(0o077)
    assert SHA(plan_path) == plan_sha and SHA(clearance_path) == clearance_sha
    plan = json.loads(Path(plan_path).read_text())
    clearance = json.loads(Path(clearance_path).read_text())
    assert clearance['status'] == 'ROOT_EXACT_CURRENT_QE_SOURCE_OPERATOR_EXECUTION_ACCEPTED'
    assert clearance['planSha256'] == plan_sha
    assert plan['profile'] == PROFILE
    assert (plan['platform'], plan['arch']) in [('darwin', 'arm64'), ('linux', 'x64')]
    assert plan['platform'] == sys.platform
    assert {'arm64': 'arm64', 'aarch64': 'arm64', 'x86_64': 'x64'}[os.uname().machine] == plan['arch']
    assert set(plan) == {'profile', 'platform', 'arch', 'sourceRoot', 'sourceCommit', 'sourceTree', 'sourceFiles',
                         'nativeRoot', 'workRoot', 'sdkArchive', 'toolchain', 'postgres', 'font'}
    repo = Path(plan['sourceRoot']).resolve(strict=True)
    native = Path(plan['nativeRoot'])
    work = Path(plan['workRoot'])
    prefix = '/private/tmp' if sys.platform == 'darwin' else '/tmp'
    assert re.fullmatch(re.escape(prefix) + r'/myeve-current-native-[a-f0-9]{32}', str(native))
    assert re.fullmatch(re.escape(prefix) + r'/myeve-current-proof-[a-f0-9]{32}', str(work))
    assert not native.exists() and not work.exists()
    pg = plan['postgres']
    assert set(pg) == {'binaries', 'port'} and pg['port'] == 56792
    assert set(pg['binaries']) == {'initdb', 'pg_ctl', 'postgres', 'psql', 'pg_controldata'}
    for binary in [*pg['binaries'].values(), *[plan['toolchain'][name] for name in ['node', 'npm', 'python', 'ps', 'lsof']]]:
        assert set(binary) == {'path', 'sha256'}
        assert Path(binary['path']).resolve(strict=True) == Path(binary['path']) and SHA(binary['path']) == binary['sha256']
    assert plan['toolchain']['platform'] == plan['platform'] and plan['toolchain']['arch'] == plan['arch']
    assert Path(sys.executable).resolve(strict=True) == Path(plan['toolchain']['python']['path'])
    ports = [56792, 3184, 3188, 3185]

    def git(*args):
        return subprocess.check_output(['/usr/bin/git', '-C', str(repo), *args], text=True, timeout=5).strip()

    def source_check():
        assert git('rev-parse', 'HEAD') == plan['sourceCommit']
        assert git('rev-parse', 'HEAD^{tree}') == plan['sourceTree']
        assert not git('status', '--porcelain')
        assert git('branch', '--show-current') == 'codex/beta-telemetry-public-20261023'
        for relative, expected in plan['sourceFiles'].items():
            path = (repo / relative).resolve(strict=True)
            assert path.is_relative_to(repo) and SHA(path) == expected

    def listeners():
        out = []
        for port in ports:
            result = subprocess.run([plan['toolchain']['lsof']['path'], '-nP', f'-iTCP:{port}', '-sTCP:LISTEN'], capture_output=True, timeout=5)
            out.append({'port': port, 'noListener': result.returncode == 1 and not result.stdout and not result.stderr})
        return out

    source_check()
    assert all(row['noListener'] for row in listeners())
    native.mkdir(mode=0o700)
    private = native / 'private'; private.mkdir(mode=0o700)
    tmp = native / 'tmp'; tmp.mkdir(mode=0o700)
    home = native / 'home'; home.mkdir(mode=0o700)
    data = native / 'data'
    node = plan['toolchain']['node']['path']
    base_env = {'PATH': str(Path(node).parent) + ':/usr/bin:/bin', 'HOME': str(home), 'TMPDIR': str(tmp), 'LC_ALL': 'C'}
    password = secrets.token_hex(32)
    password_file = private / 'bootstrap-password'
    password_file.write_text(password + '\n')
    pgpass = private / 'pgpass'; pgpass.write_text(f'127.0.0.1:{pg["port"]}:*:ux_fixture:{password}\n')
    pg_env = dict(base_env, PGPASSFILE=str(pgpass))
    events = []; first = None; cleanup_errors = []; controller = None; result = None
    pg_pid = None; system_id = None; pg_started = False; pg_start_attempted = False; stopped = False; controller_complete = False; registry_cleanup = None
    cleanup_active = False; interruption_requested = False
    def interrupted(_signal, _frame):
        nonlocal first, interruption_requested
        if interruption_requested: return
        interruption_requested = True
        if cleanup_active:
            first = first or {'stage': 'cleanup', 'type': 'RuntimeError', 'code': 'OWNED_OPERATOR_INTERRUPTED'}
            return  # retain failure, but never abort an already-owned cleanup
        raise RuntimeError('OWNED_OPERATOR_INTERRUPTED')
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    stage = 'exclusive-root'
    metadata = lambda p: {'uid': p.stat().st_uid, 'mode': stat.S_IMODE(p.stat().st_mode), 'device': p.stat().st_dev, 'inode': p.stat().st_ino}
    owned_root = metadata(native)

    def write(path, value):
        with path.open('x') as handle:
            json.dump(value, handle, indent=2); handle.write('\n')

    def event(name, **fields):
        events.append({'at': time.time(), 'event': name, **fields})

    def group_live(pid):
        try:
            os.killpg(pid, 0); return True
        except ProcessLookupError:
            return False

    def group_signal(pid, sig):
        try:
            os.killpg(pid, sig)
        except ProcessLookupError:
            pass

    def command(args, name, timeout=45, env=None):
        log = private / (name + '.log')
        with log.open('xb') as handle:
            child = subprocess.Popen([str(x) for x in args], env=env or pg_env, stdin=subprocess.DEVNULL,
                                     stdout=handle, stderr=subprocess.STDOUT, start_new_session=True)
            end = time.monotonic() + timeout
            failed = None
            try:
                while child.poll() is None:
                    if time.monotonic() >= end:
                        failed = RuntimeError(name + '_TIMEOUT'); break
                    if log.stat().st_size > 16 * 1024 * 1024:
                        failed = RuntimeError(name + '_LOG_LIMIT'); break
                    time.sleep(0.1)
            except BaseException as error:
                failed = error
            if child.poll() is not None and group_live(child.pid):
                failed = failed or RuntimeError(name + '_UNEXPECTED_LIVE_PROCESS_GROUP')
            if failed or group_live(child.pid):
                group_signal(child.pid, signal.SIGTERM)
                for _ in range(300 if name == 'controller' else 30):
                    if child.poll() is not None and not group_live(child.pid): break
                    time.sleep(0.1)
                if group_live(child.pid): group_signal(child.pid, signal.SIGKILL)
            try:
                code = child.wait(timeout=5)
            except subprocess.TimeoutExpired as error:
                unknown = RuntimeError(name + '_OWNED_CHILD_STOP_UNKNOWN')
                if failed: raise BaseExceptionGroup('Primary failure and owned child stop unknown', [failed, unknown]) from error
                raise unknown from error
            if group_live(child.pid):
                unknown = RuntimeError(name + '_OWNED_CHILD_GROUP_UNKNOWN')
                if failed: raise BaseExceptionGroup('Primary failure and owned group stop unknown', [failed, unknown])
                raise unknown
            # A fast exit can bypass every polling-time cap check.
            if log.stat().st_size > 16 * 1024 * 1024:
                failed = failed or RuntimeError(name + '_LOG_LIMIT')
            if failed: raise failed
            if code != 0: raise RuntimeError(name + '_EXIT_' + str(code))
        # Never read an unbounded output, including an escaped writer's race.
        with log.open('rb') as handle:
            content = handle.read(16 * 1024 * 1024 + 1)
        if len(content) > 16 * 1024 * 1024: raise RuntimeError(name + '_LOG_LIMIT')
        return content.decode('utf8')

    def psql(sql, name):
        return command([pg['binaries']['psql']['path'], '-X', '-w', '-qAt', '-h', '127.0.0.1', '-p', str(pg['port']),
                        '-U', 'ux_fixture', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], name)

    def control(name):
        text = command([pg['binaries']['pg_controldata']['path'], str(data)], name)
        return re.search(r'Database system identifier:\s*(\d+)', text).group(1)

    def pid_binding():
        lines = (data / 'postmaster.pid').read_text().splitlines()
        pid = int(lines[0]); assert lines[1] == str(data) and int(lines[3]) == pg['port']
        text = subprocess.check_output([plan['toolchain']['ps']['path'], '-ww', '-p', str(pid), '-o', 'command='], env=base_env, text=True, timeout=3).strip()
        assert pg['binaries']['postgres']['path'] in text and str(data) in text
        return pid

    try:
        stage = 'initdb'
        command([pg['binaries']['initdb']['path'], '-D', data, '--username=ux_fixture', '--auth-local=reject',
                 '--auth-host=scram-sha-256', '--pwfile=' + str(password_file), '--encoding=UTF8', '--locale=C'], 'initdb', 60)
        system_id = control('control-initial')
        write(private / 'data-ownership.json', {'root': owned_root, 'data': metadata(data), 'systemIdentifier': system_id})
        stage = 'pg-start'; pg_start_attempted = True
        command([pg['binaries']['pg_ctl']['path'], '-D', data, '-l', private / 'postgres.log', '-o',
                 f"-h 127.0.0.1 -p {pg['port']} -c unix_socket_directories='' -c max_connections=48", '-t', '30', '-w', 'start'], 'pg-start')
        pg_pid = pid_binding(); pg_started = True; assert control('control-started') == system_id
        stage = 'native-identity-preflight'
        row = json.loads(psql("SELECT json_build_object('role',current_user,'database',current_database(),'systemIdentifier',system_identifier::text,'dataDirectory',current_setting('data_directory'),'address',host(inet_server_addr()),'port',inet_server_port(),'encoding',current_setting('server_encoding'),'collation',datcollate,'ctype',datctype) FROM pg_control_system(),pg_database WHERE datname=current_database()", 'native-preflight'))
        assert row == {'role': 'ux_fixture', 'database': 'postgres', 'systemIdentifier': system_id, 'dataDirectory': str(data),
                       'address': '127.0.0.1', 'port': pg['port'], 'encoding': 'UTF8', 'collation': 'C', 'ctype': 'C'}
        baseline = psql('SELECT datname FROM pg_database ORDER BY datname', 'databases-before')
        preflight = private / 'native-preflight.json'
        write(preflight, {'sourceCommit': plan['sourceCommit'], 'sourceTree': plan['sourceTree'], 'cluster': row,
                          'pid': pg_pid, 'root': owned_root, 'data': metadata(data), 'planSha256': plan_sha, 'clearanceSha256': clearance_sha})
        source_check()
        private_spec = private / 'controller-spec.json'
        write(private_spec, {'profile': PROFILE, 'sourceRoot': str(repo), 'sourceCommit': plan['sourceCommit'], 'workRoot': str(work),
                             'sdkArchive': plan['sdkArchive'], 'toolchain': plan['toolchain'], 'font': plan['font'],
                             'ports': {'model': 3184, 'web': 3188, 'eve': 3185},
                             'native': {'adminUrl': f'postgresql://ux_fixture:{quote(password, safe="")}@127.0.0.1:{pg["port"]}/postgres',
                                        'systemIdentifier': system_id, 'dataDirectory': str(data), 'port': pg['port'], 'operatorPreflightSha256': SHA(preflight)}})
        stage = 'current-qe-controller-once'
        text = command([node, str(repo / 'scripts/myapps-composition/current-qe-runtime.mjs'), '--spec', private_spec], 'controller', 600, base_env)
        result = json.loads(text.strip().splitlines()[-1]); controller_complete = True
        assert result['status'] == 'CURRENT_PUBLIC_FUNCTIONAL_CHAIN_OBSERVED_OPERATOR_CLEANUP_REQUIRED'
        assert result['profile'] == PROFILE and result['sourceCommit'] == plan['sourceCommit'] and result['sourceTree'] == plan['sourceTree']
        assert Path(result['proofFile']).resolve(strict=True).is_relative_to(work.resolve(strict=True))
        assert SHA(result['proofFile']) == result['proofSha256']
        proof = json.loads(Path(result['proofFile']).read_text())
        assert proof['platform'] == plan['platform'] and proof['arch'] == plan['arch']
        assert proof['nativePreflightSha256'] == SHA(preflight)
        assert proof['databaseCleanup']['status'] == 'OWNED_DATABASES_DROPPED_NONFORCE'
        assert proof.get('modelLifecycleFinalized') is True
        assert psql('SELECT datname FROM pg_database ORDER BY datname', 'databases-after') == baseline
        assert int(psql("SELECT count(*) FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND datname IS NOT NULL", 'connections-after')) == 0
        event('current-chain-observed', proofSha256=result['proofSha256'])
    except BaseException as error:
        first = {'stage': stage, 'type': type(error).__name__, 'code': str(error) if isinstance(error, RuntimeError) else 'OPERATOR_ASSERTION_OR_COMMAND_FAILED'}
        write(private / 'first-failure-private.json', {'stage': stage, 'type': type(error).__name__, 'traceback': traceback.format_exc()})
        event('first-failure-no-retry', **first)
    finally:
        cleanup_active = True
        try:
            # Stop only the cluster whose physical control and original PID match.
            # A failed/unknown controller retains HOLD and may require root review.
            assert metadata(native) == owned_root
            if work.exists():
                def process_identity(pid):
                    result = subprocess.run([plan['toolchain']['ps']['path'], '-ww', '-p', str(pid), '-o', 'pid=', '-o', 'pgid=', '-o', 'lstart=', '-o', 'command='], env=base_env, capture_output=True, text=True, timeout=3)
                    if result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip(): return None
                    assert result.returncode == 0
                    match = re.fullmatch(r'\s*(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\w{3}\s+\d{1,2}\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.+?)\s*', result.stdout)
                    assert match
                    return {'pid': int(match[1]), 'pgid': int(match[2]), 'start': ' '.join(match[3].split())}
                registry_cleanup = cleanup_registered_groups(work / 'evidence/owned-groups.ndjson', work_root=work,
                    binaries={node, plan['toolchain']['python']['path']}, identity=process_identity,
                    group_live=group_live, group_signal=group_signal, sleep=time.sleep)
        except BaseException as error:
            cleanup_errors.append({'type': type(error).__name__, 'code': 'OWNED_DETACHED_GROUP_CLEANUP_UNKNOWN'})
            write(private / 'group-cleanup-private.json', {'traceback': traceback.format_exc()})
        try:
            assert metadata(native) == owned_root
            cluster_cleanup = stop_owned_cluster(data=data, system_id=system_id, pg_pid=pg_pid, initialized=system_id is not None,
                start_attempted=pg_start_attempted, started=pg_started, control=control, pid_binding=pid_binding, command=command, pg=pg)
            stopped = cluster_cleanup['stopped']; pg_pid = cluster_cleanup['pid']
        except BaseException as error:
            cleanup_errors.append({'type': type(error).__name__, 'code': 'OWNED_CLUSTER_STOP_UNKNOWN'})
        final_ports = listeners()
        try:
            source_check(); source_clean = True
        except BaseException:
            source_clean = False
        # Remove only this operator's bootstrap secrets. Application fixture
        # launch files remain private evidence, never public logs or Git inputs.
        for name in ['bootstrap-password', 'pgpass', 'controller-spec.json']:
            (private / name).unlink(missing_ok=True)
        good = not first and not cleanup_errors and stopped and source_clean and controller_complete and all(row['noListener'] for row in final_ports)
        receipt = {'status': 'PASS_CURRENT_QE_PUBLIC_CHAT_' + plan['platform'].upper() + '_' + plan['arch'].upper() if good else 'FAIL_FIRST_ATTEMPT_PRESERVED',
                   'profile': PROFILE, 'sourceCommit': plan['sourceCommit'], 'sourceTree': plan['sourceTree'],
                   'planSha256': plan_sha, 'clearanceSha256': clearance_sha, 'firstFailure': first, 'cleanupErrors': cleanup_errors,
                   'events': events, 'clusterSystemIdentifier': system_id, 'clusterPID': pg_pid, 'clusterStopped': stopped,
                   'sourceCleanAfter': source_clean, 'ports': final_ports, 'controller': result, 'detachedGroupCleanup': registry_cleanup,
                   'limits': ['Only the executed declared platform/architecture; no cross-platform inheritance', 'No historical tokenizer parity',
                              'No real provider, paid Work, tester or deployment qualification',
                              'Normal module/socket tripwires are not a hostile-native sandbox', 'Positive Work FAIL/HOLD unchanged']}
        write(native / 'operator-receipt.json', receipt)
        print(json.dumps({'status': receipt['status'], 'firstFailure': first, 'clusterStopped': stopped, 'allPortsNoListener': all(row['noListener'] for row in final_ports), 'receipt': str(native / 'operator-receipt.json')}))
        if not good: raise SystemExit(1)


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--plan', required=True); args.add_argument('--plan-sha256', required=True)
    args.add_argument('--clearance', required=True); args.add_argument('--clearance-sha256', required=True)
    parsed = args.parse_args()
    execute(Path(parsed.plan), parsed.plan_sha256, Path(parsed.clearance), parsed.clearance_sha256)
