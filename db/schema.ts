import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', { userId: text('user_id').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const resumes = sqliteTable('resumes', { userId: text('user_id').primaryKey(), objectKey: text('object_key').notNull(), filename: text('filename').notNull(), updatedAt: text('updated_at').notNull() });
export const searches = sqliteTable('searches', { userId: text('user_id').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const saved = sqliteTable('saved', { userId: text('user_id').notNull(), jobId: text('job_id').notNull(), data: text('data').notNull(), createdAt: text('created_at').notNull() }, t=>[primaryKey({columns:[t.userId,t.jobId]})]);
export const cache = sqliteTable('source_cache', { source: text('source').primaryKey(), data: text('data').notNull(), updatedAt: text('updated_at').notNull() });
export const limits = sqliteTable('limits', { key: text('key').primaryKey(), count: integer('count').notNull() });
