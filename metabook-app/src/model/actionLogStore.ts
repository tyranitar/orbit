import * as AbstractLeveldown from "abstract-leveldown";
import LevelUp, * as levelup from "levelup";
import * as lexi from "lexicographic-integer";

import { ActionLog, ActionLogID } from "metabook-core";
import { ServerTimestamp } from "metabook-firebase-support";
import RNLeveldown from "react-native-leveldown";
import sub from "subleveldown";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

const latestLogServerTimestampDBKey = "_latestLogServerTimestamp";
const hasCompletedInitialImportDBKey = "_hasCompletedInitialImport";

function getActionLogIDFromTaskIDIndexDBKey(key: string) {
  return key.split("!")[2] as ActionLogID;
}

export default class ActionLogStore {
  private rootDB: levelup.LevelUp;
  private actionLogDB: levelup.LevelUp;
  private taskIDIndexDB: levelup.LevelUp;

  private cachedLatestServerTimestamp: ServerTimestamp | null | undefined;
  private cachedHasCompletedInitialImport: boolean | undefined;

  constructor(storeName = "ActionLogStore") {
    this.rootDB = LevelUp(new RNLeveldown(storeName));
    this.actionLogDB = sub(this.rootDB, "logs");
    this.taskIDIndexDB = sub(this.rootDB, "taskIDIndex");
  }

  async getLatestServerTimestamp(): Promise<ServerTimestamp | null> {
    if (this.cachedLatestServerTimestamp === undefined) {
      const result = await getJSONRecord(
        this.actionLogDB,
        latestLogServerTimestampDBKey,
      );
      this.cachedLatestServerTimestamp =
        (result?.record as ServerTimestamp) ?? null;
    }
    return this.cachedLatestServerTimestamp ?? null;
  }

  async hasCompletedInitialImport(): Promise<boolean> {
    if (this.cachedHasCompletedInitialImport === undefined) {
      const result = await getJSONRecord(
        this.actionLogDB,
        hasCompletedInitialImportDBKey,
      );
      this.cachedHasCompletedInitialImport =
        (result?.record as boolean) ?? null;
    }
    return this.cachedHasCompletedInitialImport ?? null;
  }

  async markInitialImportCompleted(): Promise<void> {
    await saveJSONRecord(
      this.actionLogDB,
      hasCompletedInitialImportDBKey,
      true,
    );
    this.cachedHasCompletedInitialImport = true;
  }

  async saveActionLogs(
    entries: Iterable<{
      log: ActionLog;
      id: ActionLogID;
      serverTimestamp: ServerTimestamp | null;
    }>,
  ): Promise<ServerTimestamp | null> {
    const initialLatestServerTimestamp = await this.getLatestServerTimestamp();
    let latestServerTimestamp = initialLatestServerTimestamp;

    const operations: AbstractLeveldown.AbstractBatch[] = [];
    const taskIDIndexOperations: AbstractLeveldown.AbstractBatch[] = [];
    for (const { log, id, serverTimestamp } of entries) {
      const encodedLog = JSON.stringify(log);
      operations.push({ type: "put", key: id, value: encodedLog });
      taskIDIndexOperations.push({
        type: "put",
        key: `${log.taskID}!${lexi.pack(log.timestampMillis, "hex")}!${id}`,
        value: encodedLog,
      });

      if (
        serverTimestamp &&
        (latestServerTimestamp === null ||
          serverTimestamp.seconds > latestServerTimestamp.seconds ||
          (serverTimestamp.seconds === latestServerTimestamp.seconds &&
            serverTimestamp.nanoseconds > latestServerTimestamp.nanoseconds))
      ) {
        latestServerTimestamp = {
          seconds: serverTimestamp.seconds,
          nanoseconds: serverTimestamp.nanoseconds,
        };
      }
    }

    if (latestServerTimestamp !== initialLatestServerTimestamp) {
      operations.push({
        type: "put",
        key: latestLogServerTimestampDBKey,
        value: JSON.stringify(latestServerTimestamp),
      });
      this.cachedLatestServerTimestamp = latestServerTimestamp;
    }

    await Promise.all([
      this.actionLogDB.batch(operations),
      this.taskIDIndexDB.batch(taskIDIndexOperations),
    ]);
    return latestServerTimestamp;
  }

  async getActionLog(id: ActionLogID): Promise<ActionLog | null> {
    const result = await getJSONRecord(this.actionLogDB, id);
    return (result?.record as ActionLog) ?? null;
  }

  async getActionLogsByTaskID(
    taskID: string,
    limit?: number,
  ): Promise<{ log: ActionLog; id: ActionLogID }[]> {
    return new Promise((resolve, reject) => {
      const output: { log: ActionLog; id: ActionLogID }[] = [];

      const iterator = this.taskIDIndexDB.iterator({
        keys: true,
        values: true,
        gte: taskID,
        lt: taskID + "~", // ~ is sorted after all ASCII characters
        limit: limit ?? -1,
      });
      async function iterate(
        error: Error | undefined,
        key: string | undefined,
        value: string | undefined,
      ) {
        if (error) {
          reject(error);
        } else if (key && value) {
          const id = getActionLogIDFromTaskIDIndexDBKey(key);
          const log = JSON.parse(value) as ActionLog;
          output.push({ log, id });
          iterator.next(iterate);
        } else {
          iterator.end((error) => (error ? reject(error) : resolve(output)));
        }
      }
      iterator.next(iterate);
    });
  }

  async iterateAllActionLogsByTaskID(
    visitor: (
      taskID: string,
      logEntries: { log: ActionLog; id: ActionLogID }[],
    ) => Promise<unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let currentTaskID: string | null = null;
      let currentTaskLogs: { log: ActionLog; id: ActionLogID }[] = [];

      const iterator = this.taskIDIndexDB.iterator({
        keys: true,
        values: true,
      });
      async function iterate(
        error: Error | undefined,
        key: string | undefined,
        value: string | undefined,
      ) {
        if (error) {
          reject(error);
        } else if (key && value) {
          const id = getActionLogIDFromTaskIDIndexDBKey(key);
          const actionLog = JSON.parse(value) as ActionLog;
          if (currentTaskID && actionLog.taskID !== currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs).catch(reject);
            currentTaskLogs = [];
            currentTaskID = actionLog.taskID;
          } else if (currentTaskID === null) {
            currentTaskID = actionLog.taskID;
          }
          currentTaskLogs.push({ log: actionLog, id });
          iterator.next(iterate);
        } else {
          if (currentTaskID) {
            await visitor(currentTaskID, currentTaskLogs).catch(reject);
          }
          iterator.end((error) => (error ? reject(error) : resolve()));
        }
      }
      iterator.next(iterate);
    });
  }

  async clear(): Promise<void> {
    await this.rootDB.clear();
  }

  async close(): Promise<void> {
    await this.rootDB.close();
  }
}