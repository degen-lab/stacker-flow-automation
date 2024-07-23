import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { DATABASE_PATH } from './consts';

export const dbPromise = open({
  filename: DATABASE_PATH,
  driver: sqlite3.Database,
});

export const query = async (sql: string, params?: any[]) => {
  const db = await dbPromise;
  return db.run(sql, params);
};

export const get = async (sql: string, params?: any[]) => {
  const db = await dbPromise;
  return db.get(sql, params);
};

export const all = async (sql: string, params?: any[]) => {
  const db = await dbPromise;
  return db.all(sql, params);
};
