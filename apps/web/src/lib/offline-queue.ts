import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface PosQueueRecord {
  id: string;
  payload: string;
  createdAt: number;
}

interface ErpOfflineDb extends DBSchema {
  posQueue: {
    key: string;
    value: PosQueueRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<ErpOfflineDb>> | null = null;

function getDb(): Promise<IDBPDatabase<ErpOfflineDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ErpOfflineDb>("erp-offline", 1, {
      upgrade(db) {
        db.createObjectStore("posQueue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function enqueuePosCheckout(payload: unknown): Promise<string> {
  const db = await getDb();
  const id = globalThis.crypto.randomUUID();
  await db.put("posQueue", {
    id,
    payload: JSON.stringify(payload),
    createdAt: Date.now(),
  });
  return id;
}

export async function drainPosQueue(handler: (record: PosQueueRecord) => Promise<void>): Promise<void> {
  const db = await getDb();
  const all = await db.getAll("posQueue");
  for (const row of all) {
    await handler(row);
    await db.delete("posQueue", row.id);
  }
}

export async function peekPosQueue(): Promise<PosQueueRecord[]> {
  const db = await getDb();
  return db.getAll("posQueue");
}
