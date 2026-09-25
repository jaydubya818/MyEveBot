import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='pg')return {url:'file:///tmp/myeve-acceptance-88370d0/isolated-pg.mjs',shortCircuit:true};return nextResolve(specifier,context);}});
