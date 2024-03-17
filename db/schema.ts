import { int, mysqlTable, varchar, datetime, text } from 'drizzle-orm/mysql-core';
import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

export const rw_parsed_server = mysqlTable('rw_parsed_server', {
    id: int('id').primaryKey(),
    timestamp: datetime('timestamp').default(new Date()),
    rank: int('rank'),
    ip: varchar('ip', { length: 255 }),
    title: varchar('title', { length: 255 }),
    region: varchar('region', { length: 255 }),
    players: int('players'),
    wipe_schedule: varchar('wipe_schedule', { length: 255 }),
    game_mode: varchar('game_mode', { length: 255 }),
    resource_rate: varchar('resource_rate', { length: 255 }),
    group_limit: varchar('group_limit', { length: 255 }),
    last_wipe: varchar('last_wipe', { length: 255 }),
    last_bp_wipe: varchar('last_bp_wipe', { length: 255 }),
    next_wipe: varchar('next_wipe', { length: 255 }),
    next_wipe_full: varchar('next_wipe_full', { length: 255 }),
    next_wipe_is_bp: varchar('next_wipe_is_bp', { length: 255 }),
    next_wipe_hour: int('next_wipe_hour'),
    next_wipe_dow: int('next_wipe_dow'),
    next_wipe_week: int('next_wipe_week'),
    main_wipe_hour: int('main_wipe_hour'),
    main_wipe_dow: int('main_wipe_dow'),
    sec_wipe_hour: int('sec_wipe_hour'),
    sec_wipe_dow: int('sec_wipe_dow'),
    bp_wipe_hour: int('bp_wipe_hour'),
    bp_wipe_dow: int('bp_wipe_dow'),
});

export type ParsedServer = InferSelectModel<typeof rw_parsed_server>;
export type InsertParsedServer = InferInsertModel<typeof rw_parsed_server>;

export const rw_wipe_history = mysqlTable('rw_wipe_history', {
    id: int('id').autoincrement().primaryKey(),
    bm_id: int('bm_id'),
    timestamp: datetime('timestamp').default(new Date()),
    wipe_time: varchar('wipe_time', { length: 255 }),
    is_bp: varchar('is_bp', { length: 255 }),
    title: varchar('title', { length: 255 }),
    description: text('description'),
    attributes: text('attributes'),
});

export type WipeHistory = InferSelectModel<typeof rw_wipe_history>;
export type InsertWipeHistory = InferInsertModel<typeof rw_wipe_history>;

export const rw_scrapper_stats = mysqlTable('rw_scrapper_stats', {
    id: int('id').autoincrement().primaryKey(),
    date: datetime('date').default(new Date()),
    scrapper_duration: int('scrapper_duration'),
    servers_parsed: int('servers_parsed'),
    servers_skipped: int('servers_skipped'),
    servers_posted: int('servers_posted'),
});

export type ScrapperStats = InferSelectModel<typeof rw_scrapper_stats>;
export type InsertScrapperStats = InferInsertModel<typeof rw_scrapper_stats>;

export const rw_server_network = mysqlTable('rw_server_network', {
    id: int('id').primaryKey(),
    bm_ids: varchar('bm_ids', { length: 255 }),
    name: varchar('name', { length: 255 }),
    region: varchar('region', { length: 255 }),
});

export type ServerNetwork = InferSelectModel<typeof rw_server_network>;
export type InsertServerNetwork = InferInsertModel<typeof rw_server_network>;
