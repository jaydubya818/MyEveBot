import {ensureConfiguredLocalApps,closeLocalAppsBootstrap} from '../lib/myapps/local-bootstrap.ts';

// Operator intake only: original canonical Result UUID and explicit release number.
// No package, source, owner, permission, command or approval comes from a request body.
try {
  if(process.argv.length!==4)throw Error('APP_INPUT_INVALID');
  const binding=ensureConfiguredLocalApps();
  if(!binding)throw Error('APP_UNAVAILABLE');
  const result=await binding.prepareResult(process.argv[2],Number(process.argv[3]));
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{
  console.error('App preparation failed. No installation was approved; inspect the original Result and operator configuration.');
  process.exitCode=1;
}finally{await closeLocalAppsBootstrap();}
