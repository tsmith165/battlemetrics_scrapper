import moment from 'moment-timezone';
import { db, rw_parsed_server } from '../db/db.js';
import { eq, sql } from 'drizzle-orm';
import { BM_DATE_FORMAT } from '../utils/bm_scrapper_constants.js';
import {
    parse_server_attributes,
    parse_grouped_attributes_for_max,
    search_for_existing_and_combine,
    insert_into_db,
    fetch_api_url,
    create_bm_server_list_api_call_string,
    safeParseDateString,
} from '../helpers/scrapper_generic_helper.js';
import { logStats, logError } from '../utils/stats_logger.js';

async function parse_single_server(server, options, stats) {
    const attrs = server.attributes;
    if (!attrs) {
        return stats;
    }

    let { id, ip, port, rank, name, players, details } = attrs;
    let rust_last_wipe, rust_next_wipe, rust_next_wipe_full, rust_description;

    rust_description = details ? details.rust_description : '';
    rust_last_wipe = details ? details.rust_last_wipe : null;
    rust_next_wipe = details ? details.rust_next_wipe : null;
    rust_next_wipe_full = details ? details.rust_next_wipe_full : null;

    const existing_record = await db
        .select()
        .from(rw_parsed_server)
        .where(eq(rw_parsed_server.id, sql`CAST(${id} AS INTEGER)`))
        .execute();

    if (existing_record && existing_record.length > 0) {
        const existingLastWipe = safeParseDateString(existing_record[0].last_wipe);
        const newLastWipe = safeParseDateString(rust_last_wipe);

        if (existingLastWipe && newLastWipe && existingLastWipe.getTime() === newLastWipe.getTime()) {
            console.log(`Skipping server ${id} as it hasn't wiped since our last update.`);
            return stats;
        }
    }
    console.log(`Parsing server ${id} as it has wiped since our last update.`);

    if (rank > options.min_rank) {
        console.log(`Not saving servers with rank > ${options.min_rank} in DB. Skipping ${name}. Amount skipped: ${stats.servers_skipped}`);
        if (!stats.skipped_servers_array.includes(id)) {
            stats.skipped_servers_array.push(id);
            stats.servers_skipped++;
        }
        return stats;
    }
    stats.servers_parsed++;

    const server_attributes = parse_server_attributes(name, rust_description);
    const [max_attributes, server_attribute_stats] = parse_grouped_attributes_for_max(server_attributes);

    Object.entries(server_attribute_stats).forEach(([attribute, count]) => {
        if (!stats.server_attribute_stats[attribute]) {
            stats.server_attribute_stats[attribute] = typeof count === 'number' ? count : 0;
        } else {
            stats.server_attribute_stats[attribute] += count;
        }
    });

    const dataToInsert = {
        id: parseInt(id),
        rank: rank,
        ip: `${ip}:${port}`,
        title: name,
        region: options.country,
        players: players,
        wipe_schedule: max_attributes.wipe_schedule,
        game_mode: max_attributes.game_mode,
        resource_rate: max_attributes.resource_rate,
        group_limit: max_attributes.group_limit,
        last_wipe: rust_last_wipe,
        next_wipe: rust_next_wipe,
        next_full_wipe: rust_next_wipe_full,
    };

    const final_data_to_insert = await search_for_existing_and_combine(id, dataToInsert);

    console.log(
        `Inserting bm_id ${id} with attr keys: [${Object.keys(
            max_attributes
        )}] | last_wipe: ${rust_last_wipe} | next_wipe: ${rust_next_wipe} | next_full_wipe: ${rust_next_wipe_full}`
    );
    await insert_into_db(final_data_to_insert);
    stats.servers_posted++;

    return stats;
}

async function parse_server_list_data(response, options, stats) {
    if (!response.data) {
        console.log('Response data not present. Response output (Next Line):');
        console.log(response);
        return stats;
    }
    for (const server of response.data) {
        stats = await parse_single_server(server, options, stats);
    }
    console.log('Successfully parsed server list data.');
    return stats;
}

async function run_scrapper(options, stats) {
    const api_url = create_bm_server_list_api_call_string(options.country, options.distance, options.min_players, options.page_length);
    const data = await fetch_api_url(api_url);

    if (data) {
        stats = await parse_server_list_data(data, options, stats);
    }

    return stats;
}

async function run_all_servers(options, stats) {
    let hasMorePages = true;
    let nextPageUrl = create_bm_server_list_api_call_string(options.country, options.distance, options.min_players, options.page_length);

    while (hasMorePages) {
        console.log('Fetching next page at:', nextPageUrl);
        const data = await fetch_api_url(nextPageUrl);

        if (!data || !data.data) {
            console.log('No data found. Exiting scrapper...');
            hasMorePages = false;
            break;
        }

        console.log('Parsing server list data...');
        stats = await parse_server_list_data(data, options, stats);

        const duration = moment.duration(moment().diff(stats.start_time));
        const log_stats = {
            servers_parsed: stats.servers_parsed,
            servers_skipped: stats.servers_skipped,
            servers_posted: stats.servers_posted,
            scrapper_duration: duration.asSeconds(),
        };
        await logStats(log_stats);

        nextPageUrl = data.links && data.links.next ? data.links.next : null;
        hasMorePages = !!nextPageUrl;

        if (hasMorePages) {
            console.log('Pausing for 5 seconds before pulling next page at:', nextPageUrl);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

async function log_stats(start_time, end_time, stats) {
    const duration = moment.duration(end_time.diff(start_time));
    const log_stats = {
        servers_parsed: stats.servers_parsed,
        servers_skipped: stats.servers_skipped,
        servers_posted: stats.servers_posted,
        scrapper_duration: duration.asSeconds(),
    };
    await logStats(log_stats);
}

export async function runScrapper(options = {}) {
    console.log('DB URL:', process.env.NEON_DATABASE_URL);

    if (!db) {
        console.log('Failed to connect to Database. Exiting scrapper...');
        return;
    }

    const defaultOptions = {
        all: false,
        interval: false,
        max_days_old: 150,
        min_rank: 5000,
        country: 'US',
        min_players: 0,
        page_length: 25,
        distance: 5000,
    };

    options = { ...defaultOptions, ...options };

    let stats = {
        start_time: moment(),
        servers_parsed: 0,
        servers_posted: 0,
        servers_skipped: 0,
        skipped_servers_array: [],
        server_attribute_stats: {},
    };

    if (options.all) {
        await run_all_servers(options, stats);
    } else {
        do {
            const start_time = moment();
            stats = await run_scrapper(options, stats);
            console.log('Scrapper run completed.');
            if (options.interval) {
                console.log('Waiting for 5 seconds...');
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
            const end_time = moment();
            await log_stats(start_time, end_time, stats);
        } while (options.interval);
    }
}
