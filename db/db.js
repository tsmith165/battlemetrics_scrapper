import dotenv from 'dotenv';
dotenv.config();

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import {
    rw_servers,
    rw_parsed_server,
    rw_server_network,
    kits,
    KitExtraImages,
    users,
    pending_transactions_table,
    verified_transactions_table,
    player_stats,
    server_performance,
    next_wipe_info,
    map_options,
    map_votes,
} from './schema.js';

const sql = neon(process.env.NEON_DATABASE_URL);
const db = drizzle(sql);

export {
    db,
    rw_servers,
    rw_parsed_server,
    rw_server_network,
    kits,
    KitExtraImages,
    users,
    pending_transactions_table,
    verified_transactions_table,
    player_stats,
    server_performance,
    next_wipe_info,
    map_options,
    map_votes,
};
