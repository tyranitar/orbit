import { SQLMigration } from "./migrationType";

const migration: SQLMigration = {
  version: 20210612112129,
  statements: [
    `PRAGMA recursive_triggers = TRUE`,
    `PRAGMA journal_mode = WAL`,
    `
    CREATE TABLE events (
      sequenceNumber INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE NOT NULL,
      entityID TEXT NOT NULL,
      data TEXT NOT NULL
    )
    `,
    `
    CREATE TABLE entities (
      -- Used only to produce stable ordering.
      rowID INTEGER PRIMARY KEY AUTOINCREMENT,
      
      id TEXT UNIQUE NOT NULL,
      lastEventID TEXT NOT NULL,
      data TEXT NOT NULL,
      
      FOREIGN KEY (lastEventID) REFERENCES events(id)
    )
    `,

    // This table (and the triggers which maintain it) exists to allow efficient querying of tasks by due timestamp.
    `
    CREATE TABLE derived_taskComponents (
      taskID TEXT NOT NULL,
      componentID TEXT NOT NULL,
      dueTimestampMillis INTEGER NOT NULL,
      PRIMARY KEY (taskID, componentID),
      FOREIGN KEY (taskID) REFERENCES entities(id)
    )
    `,
    `
    CREATE TRIGGER entities_taskComponents_insert AFTER INSERT ON entities BEGIN
      INSERT INTO derived_taskComponents (taskID, componentID, dueTimestampMillis)
      SELECT new.id, key, json_extract(value, "$.dueTimestampMillis") FROM json_each(json_extract(new.data, "$.componentStates"));
    END
    `,
    `
    CREATE TRIGGER entities_taskComponents_update AFTER UPDATE ON entities BEGIN
      DELETE FROM derived_taskComponents WHERE taskID = old.id;
      INSERT INTO derived_taskComponents (taskID, componentID, dueTimestampMillis)
      SELECT new.id, key, json_extract(value, "$.dueTimestampMillis") FROM json_each(json_extract(new.data, "$.componentStates"));
    END
    `,
    `
    CREATE TRIGGER entities_taskComponents_delete AFTER DELETE ON entities BEGIN
      DELETE FROM derived_taskComponents WHERE taskID = old.id;
    END
    `,
    `CREATE INDEX derived_taskComponents_dueTimestampMillis ON derived_taskComponents (dueTimestampMillis)`,
    `CREATE INDEX events_entityID ON events (entityID)`,
  ],
};
export default migration;
