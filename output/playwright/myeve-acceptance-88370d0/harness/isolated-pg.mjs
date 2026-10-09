import pg from '/Users/jaywest/node_modules/pg/lib/index.js';
function isolated(options){if(options?.host!=='127.0.0.1'||options?.port!==55441||options?.database!=='postgres')throw new Error('Unexpected qualification database');return {...options,host:'127.0.0.1',port:55473,database:'postgres',user:'jaywest'};}
export class Pool extends pg.Pool {constructor(options){super(isolated(options));}}
export class Client extends pg.Client {constructor(options){super(isolated(options));}}
export default {...pg,Pool,Client};
