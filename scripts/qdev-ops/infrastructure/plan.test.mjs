import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));

test('prepared verifier has an isolated, retained host with no bootstrap or inbound route', () => {
  const template = read('./verifier-host.cloudformation.json');
  assert.deepEqual(Object.keys(template.Resources).sort(), ['VerifierInstance', 'VerifierSecurityGroup']);
  const instance = template.Resources.VerifierInstance;
  const p = instance.Properties;
  assert.equal(instance.DeletionPolicy, 'Retain');
  assert.equal(instance.UpdateReplacePolicy, 'Retain');
  assert.equal(p.InstanceType, 'c7g.large');
  assert.deepEqual(p.ImageId, { Ref: 'PinnedArm64AmiId' });
  assert.equal(template.Parameters.PinnedArm64AmiId.Default, undefined);
  assert.deepEqual(p.IamInstanceProfile, { Ref: 'CustodianSsmInstanceProfile' });
  for (const property of ['UserData', 'KeyName', 'LaunchTemplate', 'SecurityGroupIds', 'SecurityGroups']) {
    assert.equal(p[property], undefined, property);
  }
  assert.equal(p.MetadataOptions.HttpTokens, 'required');
  assert.equal(p.MetadataOptions.HttpPutResponseHopLimit, 1);
  assert.equal(p.NetworkInterfaces.length, 1);
  assert.deepEqual(p.NetworkInterfaces[0].GroupSet, [{ 'Fn::GetAtt': ['VerifierSecurityGroup', 'GroupId'] }]);
  const sg = template.Resources.VerifierSecurityGroup.Properties;
  assert.deepEqual(sg.SecurityGroupIngress, []);
  assert.equal(sg.SecurityGroupEgress.length, 1);
  assert.equal(sg.SecurityGroupEgress[0].IpProtocol, 'tcp');
  assert.equal(sg.SecurityGroupEgress[0].FromPort, 443);
  assert.equal(sg.SecurityGroupEgress[0].ToPort, 443);
  const disk = p.BlockDeviceMappings[0].Ebs;
  assert.equal(disk.Encrypted, true);
  assert.equal(disk.DeleteOnTermination, false);
  assert.equal(disk.VolumeType, 'gp3');
  assert.equal(disk.VolumeSize, 20);
});

test('72-hour estimate joins the exact public compute row and does not claim a hard infrastructure cap', () => {
  const e = read('./estimate-20261030.json');
  const q = read('./public-compute-price-20261030.json');
  assert.equal(q.rows.length, 1);
  const row = q.rows[0];
  assert.equal(row['Instance Type'], e.compute.instanceType);
  assert.equal(row.Location, 'US East (Ohio)');
  assert.equal(row['Operating System'], 'Linux');
  assert.equal(row['Pre Installed S/W'], 'NA');
  assert.equal(Math.round(Number(row.price) * 1e6), e.compute.usdMicrosPerHour);
  const total = e.windowHours * (e.compute.usdMicrosPerHour + e.ipv4.count * e.ipv4.usdMicrosPerHour)
    + e.storage.gib * e.storage.usdMicrosPerGiBMonth * e.windowHours / e.storage.monthHours
    + e.transfer.plannedGiB * e.transfer.usdMicrosPerGiB;
  assert.equal(total, e.infrastructureEstimateUsdMicros);
  assert.equal(total + e.modelLedgerCapUsdMicros, e.combinedPlanningUsdMicros);
  assert.equal(e.automaticStopInstalled, false);
  assert.equal(e.realResourcesCreated, false);
  assert.equal(e.status, 'PREPARATION_ONLY_NOT_A_SPENDING_CAP');
});

test('public tunnel example exposes only the two inert application hosts and rejects unmatched hosts', () => {
  const s = readFileSync(new URL('./cloudflared.example.yml', import.meta.url), 'utf8');
  assert.deepEqual([...s.matchAll(/^  - hostname: (.+)$/gm)].map(m => m[1]),
    ['qdev-chat.example.invalid', 'qdev-apps.example.invalid']);
  assert.deepEqual([...s.matchAll(/^    service: (.+)$/gm)].map(m => m[1]),
    ['http://127.0.0.1:3000', 'http://127.0.0.1:4318']);
  assert.match(s, /\n  - service: http_status:404\n$/);
  assert.match(s, /^metrics: 127\.0\.0\.1:20457$/m);
  const vercel = read('../../../apps/eve/vercel.json');
  assert.equal(vercel.git.deploymentEnabled['codex/qdev-20261030-infrastructure-plan'], false);
});
