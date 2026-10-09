import { bucket, defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

const repo = github("CaptainJon85/designapprove", { branch: "main" });

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "sfo",
    sizeMB: 50000
  });
  Postgres.volumeMounts = { "/var/lib/postgresql/data": postgresVolume };
  const proofline = bucket("proofline", { region: "iad" });
  const api = service("api", {
    source: repo,
    start: "npm run start -w @proofline/api",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { sfo: 1 },
    env: {
      PORT: "8080",
      DATABASE_URL: Postgres.env.DATABASE_URL,
      SESSION_SECRET: preserve(),
      S3_BUCKET: "${{proofline.BUCKET}}",
      S3_ACCESS_KEY: "${{proofline.ACCESS_KEY_ID}}",
      S3_SECRET_KEY: "${{proofline.SECRET_ACCESS_KEY}}",
      S3_ENDPOINT: "${{proofline.ENDPOINT}}",
      S3_REGION: "${{proofline.REGION}}",
      S3_FORCE_PATH_STYLE: "false"
    }
  });
  const web = service("web", {
    source: repo,
    start: "npm run start -w @proofline/web",
    healthcheck: "/",
    healthcheckTimeout: 300,
    replicas: { sfo: 1 },
    env: {
      API_ORIGIN: "http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}"
    }
  });

  return project("proofline", {
    resources: [Postgres, api, web, postgresVolume, proofline]
  });
});
