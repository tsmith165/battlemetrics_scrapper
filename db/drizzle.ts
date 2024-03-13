// /drizzle/db.ts
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import { connect } from '@planetscale/database';

import dotenv from 'dotenv';
dotenv.config();

console.log('Connecting to DB with URL:', process.env.PS_DATABASE_URL);

const connection = connect({
    url: process.env.PS_DATABASE_URL,
});

const db = drizzle(connection);

export default db;
