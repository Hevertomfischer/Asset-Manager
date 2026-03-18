import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import { startSyncJob } from "./jobs/syncJob";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (process.env["NODE_ENV"] !== "test") {
  startSyncJob();
}

export default app;
