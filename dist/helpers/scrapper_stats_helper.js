import moment from 'moment';
import { db, rw_scrapper_stats } from '../db/db.js';
function output_stats(start_time, end_time, servers_parsed, servers_skipped, servers_posted, server_attribute_stats) {
    const duration = moment.duration(end_time.diff(start_time));
    const scrapper_duration = `${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`;
    console.log('----------------- SCRAPPER STATS -----------------');
    console.log(`Servers Parsed: ${servers_parsed}`);
    console.log(`Servers Skipped: ${servers_skipped}`);
    console.log(`Servers Posted: ${servers_posted}`);
    console.log(`Scrapper Duration: ${scrapper_duration}`);
    console.log(`Server Attribute Stats (Next Line):\n${JSON.stringify(server_attribute_stats, null, 2)}`);
}
async function insert_scrapper_stats(start_time, end_time, servers_parsed, servers_skipped, servers_posted) {
    const duration = moment.duration(end_time.diff(start_time));
    const scrapper_duration_seconds = duration.asSeconds();
    console.log('Inserting scrapper stats into database...');
    await db
        .insert(rw_scrapper_stats)
        .values({
        scrapper_duration: Math.floor(scrapper_duration_seconds),
        servers_parsed: servers_parsed,
        servers_skipped: servers_skipped,
        servers_posted: servers_posted,
    })
        .execute();
}
export { output_stats, insert_scrapper_stats };
