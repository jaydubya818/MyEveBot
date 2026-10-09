// Public, disposable fixture credentials only. Reject every installation DSN.
const connectionString=process.env.MYEVE_TEST_DATABASE_URL??'postgresql://ux_fixture:local-only@localhost:55491/blocker_fixes';
if(!/^postgresql:\/\/ux_fixture:local-only@localhost:(55491|55591)\/blocker_fixes$/.test(connectionString))throw Error('Dedicated local UX database required');
module.exports={connectionString};
