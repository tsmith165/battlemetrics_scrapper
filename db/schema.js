// File: /db/schema.js

import { pgTable, integer, varchar, timestamp, text, serial, boolean, jsonb } from 'drizzle-orm/pg-core';

export const rw_parsed_server = pgTable('rw_parsed_server', {
    id: serial('id').primaryKey(),
    timestamp: timestamp('timestamp').defaultNow(),
    rank: integer('rank'),
    ip: varchar('ip'),
    title: varchar('title'),
    region: varchar('region'),
    players: integer('players'),
    wipe_schedule: varchar('wipe_schedule'),
    game_mode: varchar('game_mode'),
    resource_rate: varchar('resource_rate'),
    group_limit: varchar('group_limit'),
    last_wipe: timestamp('last_wipe'),
    next_wipe: timestamp('next_wipe'),
    next_full_wipe: timestamp('next_full_wipe'),
});

export const rw_server_network = pgTable('rw_server_network', {
    id: serial('id').primaryKey(),
    bm_ids: varchar('bm_ids'),
    name: varchar('name'),
    region: varchar('region'),
});

export const kits = pgTable('kits', {
    id: serial('id').notNull().primaryKey(),
    o_id: integer('o_id').notNull(),
    p_id: integer('p_id').notNull().default(0),
    active: boolean('active').default(true),
    name: text('name').notNull(),
    full_name: text('full_name'),
    price: text('price'),
    permission_string: text('permission_string'),
    description: text('description'),
    image_path: text('image_path').notNull(),
    small_image_path: text('small_image_path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    small_width: integer('small_width').notNull(),
    small_height: integer('small_height').notNull(),
    contents: jsonb('contents'),
    type: varchar('type').notNull().default('monthly'),
});

export const KitExtraImages = pgTable('KitExtraImages', {
    id: serial('id').notNull().primaryKey(),
    kit_id: integer('kit_id')
        .notNull()
        .references(() => kits.id),
    title: text('title').default(''),
    image_path: text('image_path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    small_image_path: text('small_image_path'),
    small_width: integer('small_width'),
    small_height: integer('small_height'),
});

export const users = pgTable('users', {
    id: serial('id').notNull().primaryKey(),
    steam_id: varchar('steam_id').notNull().unique(),
    steam_user: varchar('steam_user').notNull(),
    email: varchar('email'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export const pending_transactions_table = pgTable('pending_transactions', {
    id: serial('id').notNull().primaryKey(),
    kit_db_id: integer('kit_db_id')
        .notNull()
        .references(() => kits.id),
    kit_name: text('kit_name').notNull(),
    user_id: integer('user_id')
        .notNull()
        .references(() => users.id),
    email: varchar('email').notNull(),
    is_subscription: boolean('is_subscription').notNull().default(false),
    timestamp: timestamp('timestamp').defaultNow(),
});

export const verified_transactions_table = pgTable('verified_transactions', {
    id: serial('id').notNull().primaryKey(),
    kit_db_id: integer('kit_db_id')
        .notNull()
        .references(() => kits.id),
    kit_name: text('kit_name').notNull(),
    user_id: integer('user_id')
        .notNull()
        .references(() => users.id),
    steam_id: varchar('steam_id'),
    email: varchar('email').notNull(),
    is_subscription: boolean('is_subscription').notNull().default(false),
    subscription_id: text('subscription_id'),
    image_path: text('image_path').notNull(),
    image_width: integer('image_width').notNull(),
    image_height: integer('image_height').notNull(),
    date: timestamp('date').notNull(),
    end_date: timestamp('end_date'),
    stripe_id: text('stripe_id').notNull(),
    price: integer('price').notNull(),
    timestamp: timestamp('timestamp').defaultNow(),
    redeemed: boolean('redeemed').notNull().default(false),
});

export const rw_servers = pgTable('rw_servers', {
    id: serial('id').primaryKey(),
    o_id: integer('o_id').notNull(),
    name: varchar('name').notNull(),
    short_title: varchar('short_title'),
    rate: varchar('rate').notNull(),
    group_size: integer('group_size'),
    wipe_days: varchar('wipe_days').notNull(),
    wipe_time: integer('wipe_time').default(11),
    connection_url: varchar('connection_url').notNull(),
});

export const player_stats = pgTable('player_stats', {
    id: serial('id').primaryKey(),
    steam_id: varchar('steam_id').notNull(),
    server_id: varchar('server_id').notNull(),
    kills: integer('kills').notNull().default(0),
    deaths: integer('deaths').notNull().default(0),
    stone_gathered: integer('stone_gathered').notNull().default(0),
    wood_gathered: integer('wood_gathered').notNull().default(0),
    metal_ore_gathered: integer('metal_ore_gathered').notNull().default(0),
    scrap_wagered: integer('scrap_wagered').notNull().default(0),
    scrap_won: integer('scrap_won').notNull().default(0),
    last_updated: timestamp('last_updated').defaultNow(),
});

export const server_performance = pgTable('server_performance', {
    id: serial('id').primaryKey(),
    system_id: varchar('system_id', { length: 64 }).notNull(),
    server_name: varchar('server_name', { length: 255 }).notNull().default('NEW SERVER'),
    timestamp: timestamp('timestamp').defaultNow(),
    cpu_usage: text('cpu_usage').notNull(),
    memory_usage: text('memory_usage').notNull(),
    disk_usage: text('disk_usage').notNull(),
    network_in: text('network_in').notNull(),
    network_out: text('network_out').notNull(),
});

export const next_wipe_info = pgTable('next_wipe_info', {
    id: serial('id').primaryKey(),
    server_id: varchar('server_id').notNull(),
    level_url: text('level_url').notNull(),
    map_seed: integer('map_seed'),
    map_size: integer('map_size'),
    map_name: varchar('map_name'),
    is_queued: boolean('is_queued').notNull().default(false),
});

export const map_options = pgTable('map_options', {
    id: serial('id').primaryKey(),
    map_name: varchar('map_name').notNull(),
    seed: integer('seed').notNull(),
    size: integer('size').notNull(),
    level_url: text('level_url').notNull(),
    rust_maps_url: text('rust_maps_url').notNull(),
    rust_maps_image: text('rust_maps_image').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
});

export const map_votes = pgTable('map_votes', {
    id: serial('id').primaryKey(),
    map_id: integer('map_id')
        .notNull()
        .references(() => map_options.id),
    timestamp: timestamp('timestamp').defaultNow(),
    steam_id: varchar('steam_id').notNull(),
    server_id: varchar('server_id').notNull(),
});

export const server_backend_info = pgTable('server_backend_info', {
    id: serial('id').primaryKey(),
    server_id: varchar('server_id').notNull().unique(),
    server_folder: varchar('server_folder').notNull(),
});
