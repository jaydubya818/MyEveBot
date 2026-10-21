import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireLocalPostgres} from './local-database.mjs';
test('accepts explicit loopback PostgreSQL fixture URLs',()=>{
  for(const host of ['127.0.0.1','localhost','[::1]'])
    assert.equal(requireLocalPostgres(`postgresql://fixture@${host}:5432/postgres`),`postgresql://fixture@${host}:5432/postgres`);
  assert.equal(requireLocalPostgres('postgres://fixture@localhost/postgres'),'postgres://fixture@localhost/postgres');
});
test('denies deceptive loopback substrings and connection overrides before starting any service',()=>{
  for(const value of [undefined,'','postgresql://fixture:127.0.0.1@db.example.test/postgres',
    'postgresql://db.example.test/127.0.0.1','postgresql://db.example.test/postgres?marker=127.0.0.1',
    'postgresql://127.0.0.1.evil.test/postgres','postgresql://127.0.0.1@evil.test/postgres',
    'postgresql://localhost/postgres?host=evil.test','postgresql://localhost/postgres?host=/var/run/postgresql',
    'postgresql://localhost/postgres#127.0.0.1','https://127.0.0.1/postgres','file://localhost/postgres',
    'postgresql://127.1/postgres','postgresql://localhost/'])
    assert.throws(()=>requireLocalPostgres(value),/Explicit local PostgreSQL fixture required/);
});
