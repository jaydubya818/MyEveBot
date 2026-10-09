export const betaTestPort = Number(process.env.MYEVE_BETA_TEST_PORT ?? 55489);
if (!Number.isInteger(betaTestPort) || betaTestPort < 1024 || betaTestPort > 65535) throw Error("Invalid local beta test port");
