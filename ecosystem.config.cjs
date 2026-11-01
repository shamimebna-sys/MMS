module.exports = {
  apps: [
    {
      name: "mms-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
    {
      name: "mms-jobs",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/jobs/worker.ts",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
    },
  ],
};
