import { Entity, Event, EventID, IDOfEntity } from "../core2";
import { DatabaseEntityQuery, DatabaseEventQuery } from "../database";

export interface DatabaseBackend {
  close(): Promise<void>;

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>>;
  putEvents(events: Event[]): Promise<void>;

  getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>>;
  putEntities(entities: DatabaseBackendEntityRecord<Entity>[]): Promise<void>;

  // Returns events in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  listEvents(query: DatabaseEventQuery): Promise<Event[]>;

  // Returns entities in an arbitrary order which is stable on this client (i.e. so paging using afterID is safe), but which is not guaranteed to be consistent across clients.
  listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]>;
}

// We persist entities wrapped with extra metadata used for updating snapshots.
export interface DatabaseBackendEntityRecord<E extends Entity> {
  lastEventID: EventID; // i.e. last in the order as returned by the backend, following logical time, rather than client-local time
  entity: E;
}
