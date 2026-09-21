import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  userId: text('user_id').primaryKey(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const resumes = sqliteTable('resumes', {
  userId: text('user_id').primaryKey(),
  objectKey: text('object_key').notNull(),
  filename: text('filename').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const searches = sqliteTable('searches', {
  userId: text('user_id').primaryKey(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
  profileHash: text('profile_hash'),
});
export const saved = sqliteTable(
  'saved',
  {
    userId: text('user_id').notNull(),
    jobId: text('job_id').notNull(),
    data: text('data').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jobId] })],
);
export const cache = sqliteTable('source_cache', {
  source: text('source').primaryKey(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const limits = sqliteTable('limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
});
// These are each user's own quality judgments, never authoritative corrections to public jobs.
export const jobEvaluations = sqliteTable(
  'job_evaluations',
  {
    userId: text('user_id').notNull(),
    jobId: text('job_id').notNull(),
    relevance: text('relevance').notNull(),
    korea: text('korea').notNull(),
    salary: text('salary').notNull(),
    language: text('language').notNull(),
    notes: text('notes').notNull(),
    title: text('title').notNull(),
    company: text('company').notNull(),
    source: text('source').notNull(),
    score: integer('score'),
    scoreVersion: text('score_version').notNull(),
    predictedKorea: text('predicted_korea').notNull(),
    languageEvidence: text('language_evidence').notNull(),
    salarySnapshot: text('salary_snapshot').notNull(),
    searchedAt: text('searched_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.jobId] })],
);
