import firebase from "firebase/app";
import "firebase/firestore";

import {
  encodePromptTask,
  getInitialIntervalForSchedule,
  PromptTaskID,
  PromptState,
  ActionLog,
  ingestActionLogType,
  repetitionActionLogType,
  RepetitionActionLog,
  IngestActionLog,
} from "metabook-core";
import { getDefaultFirebaseApp } from "../../firebase";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import { getNextPromptStateForReviewLog } from "../../util/getNextPromptStateForActionLog";
import getPromptStates from "../getPromptStates";
import {
  MetabookReviewAction,
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

function getPromptTaskIDForActionLog(log: ActionLog): PromptTaskID {
  return encodePromptTask({
    promptID: log.promptID,
    promptParameters: log.promptParameters,
  });
}

export class MetabookFirebaseUserClient implements MetabookUserClient {
  userID: string;
  private database: firebase.firestore.Firestore;
  private readonly promptStateCache: Map<PromptTaskID, PromptState>;
  private latestTimestampByPromptTaskID: Map<PromptTaskID, number>;

  constructor(app: firebase.app.App = getDefaultFirebaseApp(), userID: string) {
    this.userID = userID;
    this.database = app.firestore();
    this.promptStateCache = new Map();
    this.latestTimestampByPromptTaskID = new Map();
  }

  async getPromptStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  subscribeToPromptStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    // TODO: handle in-memory card state records...
    const userStateLogsRef = this.getActionLogReference(this.userID).orderBy(
      "timestamp",
      "desc",
    );

    return userStateLogsRef.onSnapshot(
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type === "added") {
            this.updateCacheForLog(change.doc.data());
          } else {
            // TODO make more robust against client failures to persist / sync
            throw new Error(
              `Log entries should never disappear. Unsupported change type ${
                change.type
              } with doc ${change.doc.data()}`,
            );
          }
        }
        onCardStatesDidUpdate(new Map(this.promptStateCache));
      },
      (error: Error) => {
        onError(error);
      },
    );
  }

  private updateCacheForLog(log: ActionLog): void {
    const promptTaskID = getPromptTaskIDForActionLog(log);
    const latestPromptTimestamp = this.latestTimestampByPromptTaskID.get(
      promptTaskID,
    );
    if (
      !latestPromptTimestamp ||
      (latestPromptTimestamp && log.timestampMillis > latestPromptTimestamp) // TODO check that parents(?) match
    ) {
      switch (log.actionLogType) {
        case ingestActionLogType:
          this.updateCacheForIngestLog(log, promptTaskID);
          break;
        case repetitionActionLogType:
          this.updateCacheByAppendingRepetitionLog(log, promptTaskID);
          break;
      }

      this.latestTimestampByPromptTaskID.set(promptTaskID, log.timestampMillis);
    }
  }

  private updateCacheByAppendingRepetitionLog(
    log: RepetitionActionLog,
    promptTaskID: PromptTaskID,
  ) {
    // TODO
    /*this.promptStateCache.set(promptTaskID, {
      interval: log.nextIntervalMillis,
      dueTimestampMillis: log.nextDueTimestamp.toMillis(),
      bestInterval: log.nextBestIntervalMillis,
      needsRetry: log.nextNeedsRetry,
      taskParameters: log.promptTaskParameters,
    });*/
  }

  private updateCacheForIngestLog(
    log: IngestActionLog,
    promptTaskID: PromptTaskID,
  ) {
    const initialInterval = getInitialIntervalForSchedule("default").interval;
    this.promptStateCache.set(promptTaskID, {
      interval: initialInterval,
      dueTimestampMillis: log.timestampMillis + initialInterval,
      bestInterval: null,
      needsRetry: false,
      taskParameters: null,
    });
  }

  recordActionLogs(logs: ActionLog[]): Promise<unknown> {
    console.log("recording", logs);
    const userStateLogsRef = this.getActionLogReference(this.userID);
    const batch = this.database.batch();
    for (const log of logs) {
      const newDoc = userStateLogsRef.doc();
      batch.set(newDoc, log);
    }
    return batch.commit();
  }

  recordAction(
    update: MetabookReviewAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> } {
    const actionLog = getActionLogForAction(update);
    const commit = this.recordActionLogs([actionLog]);

    return {
      newPromptState: getNextPromptStateForReviewLog(actionLog, update.prompt),
      commit: commit,
    };
  }

  private getActionLogReference(
    userID: string,
  ): firebase.firestore.CollectionReference<ActionLog> {
    // TODO validate
    return this.database.collection(
      `users/${userID}/logs`,
    ) as firebase.firestore.CollectionReference<ActionLog>;
  }
}