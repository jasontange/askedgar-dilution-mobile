import {index,integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
// Identity is the platform-verified, stable per-Site user ID. No email is persisted.
export const watchlists=sqliteTable('watchlists',{
  userId:text('user_id').primaryKey(),
  tickers:text('tickers').notNull().default('[]'),
  revision:integer('revision').notNull().default(0),
  updatedAt:text('updated_at').notNull().default(''),
});
// Shared market data only; account watchlists remain in their own user-scoped table.
export const apiResponseCache=sqliteTable('api_response_cache',{
  key:text('key').primaryKey(),
  body:text('body'),
  fetchedAt:integer('fetched_at').notNull().default(0),
  expiresAt:integer('expires_at').notNull().default(0),
  leaseToken:text('lease_token'),
  leaseUntil:integer('lease_until').notNull().default(0),
},table=>[index('api_response_cache_expiry').on(table.expiresAt)]);
