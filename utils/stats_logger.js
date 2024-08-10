import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import moment from 'moment-timezone';
import { sendEmail } from './emails/resend_utils.js';
import StatsEmailTemplate from './emails/templates/StatsEmailTemplate.js';

const STATS_FILE_PATH = path.join(process.cwd(), 'scrapper_stats.log');

export async function logStats(stats) {
    const timestamp = moment().tz('America/Los_Angeles').format();
    const logEntry = JSON.stringify({ ...stats, timestamp, errors: [] });
    await fs.appendFile(STATS_FILE_PATH, logEntry + '\n');
}

export async function logError(error) {
    const timestamp = moment().tz('America/Los_Angeles').format();
    const logEntry = JSON.stringify({ timestamp, error });
    await fs.appendFile(STATS_FILE_PATH, logEntry + '\n');
}

async function readStatsFile() {
    try {
        const fileContent = await fs.readFile(STATS_FILE_PATH, 'utf-8');
        return fileContent
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    } catch (error) {
        console.error('Error reading stats file:', error);
        return [];
    }
}

async function clearStatsFile() {
    await fs.writeFile(STATS_FILE_PATH, '');
}

async function sendDailySummaryEmail() {
    const stats = await readStatsFile();
    const totalServers = stats.reduce((acc, curr) => acc + curr.servers_parsed, 0);
    const totalSkipped = stats.reduce((acc, curr) => acc + curr.servers_skipped, 0);
    const totalPosted = stats.reduce((acc, curr) => acc + curr.servers_posted, 0);
    const avgDuration = stats.reduce((acc, curr) => acc + curr.scrapper_duration, 0) / stats.length;
    const errors = stats.flatMap((stat) => ('errors' in stat ? stat.errors : []));

    const emailHtml = StatsEmailTemplate({
        totalServers,
        totalSkipped,
        totalPosted,
        avgDuration,
        errors,
    });

    await sendEmail({
        from: 'scrapper@rustwipes.net',
        to: process.env.ADMIN_EMAIL,
        subject: 'Daily Scrapper Stats Summary',
        html: emailHtml,
    });

    await clearStatsFile();
}

export function initializeStatsLogger() {
    cron.schedule('0 10 * * *', sendDailySummaryEmail, {
        timezone: 'America/Los_Angeles',
    });
}
