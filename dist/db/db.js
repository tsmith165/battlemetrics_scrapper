import dotenv from 'dotenv';
dotenv.config();
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { rw_parsed_server, rw_wipe_history, rw_scrapper_stats, rw_server_network } from './schema.js';
const sql = neon(process.env.NEON_DATABASE_URL);
const db = drizzle(sql);
export { db, rw_parsed_server, rw_wipe_history, rw_scrapper_stats, rw_server_network };
