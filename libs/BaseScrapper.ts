// /libs/BaseScrapper.ts
import moment from 'moment-timezone';
import db from '../db/drizzle.js';
import { WipeHistory, rw_wipe_history } from '../db/schema.js';
import { eq, and } from 'drizzle-orm/expressions';

import { BM_DATE_FORMAT } from '../utils/bm_scrapper_constants.js';
import {
    parse_server_attributes,
    parse_grouped_attributes_for_max,
    search_for_existing_and_combine,
    insert_into_db,
    fetch_api_url,
    create_bm_server_list_api_call_string,
} from '../helpers/scrapper_generic_helper.js';

interface ScrapperOptions {
    all?: boolean;
    interval?: boolean;
    max_days_old?: number;
    min_rank?: number;
    country?: string;
    min_players?: number;
    page_length?: number;
    distance?: number;
}

class BaseScrapper {
    protected options: ScrapperOptions;
    protected all: boolean;
    protected interval: boolean;
    protected max_days_old: number;
    protected min_rank: number;
    protected country: string;
    protected min_players: number;
    protected page_length: number;
    protected distance: number;
    protected start_time: moment.Moment | null;
    protected end_time: moment.Moment | null;
    protected servers_parsed: number;
    protected servers_posted: number;
    protected servers_skipped: number;
    protected server_attribute_stats: { [key: string]: number };
    protected bufferLogs: boolean;

    constructor(options: ScrapperOptions = {}) {
        this.options = options;

        this.all = options.all || false;
        this.interval = this.all ? false : this.options.interval || false;

        this.max_days_old = this.options.max_days_old || 150;
        this.min_rank = this.options.min_rank || 5000;
        this.country = this.options.country || 'US';
        this.min_players = this.options.min_players || 0;
        this.page_length = this.options.page_length || 25;
        this.distance = this.options.distance || 5000;

        this.start_time = null;
        this.end_time = null;
        this.servers_parsed = 0;
        this.servers_posted = 0;
        this.servers_skipped = 0;
        this.server_attribute_stats = {};
        this.bufferLogs = false;
    }

    async run(): Promise<void> {
        console.log('DB URL:', process.env.PS_DATABASE_URL);

        if (!db) {
            console.log('Failed to connect to Database. Exiting scrapper...');
            return;
        }

        if (this.all) {
            await this.run_all_servers();
        } else {
            do {
                await this.run_scrapper();
                console.log('Scrapper run completed.');
                if (this.interval) {
                    console.log('Waiting for 5 seconds...');
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            } while (this.interval);
        }
    }

    // Placeholder for child class implementation
    async run_scrapper(): Promise<void> {
        throw new Error('run_scrapper() must be implemented by subclasses');
    }

    async parse_server_list_data(response: any): Promise<void> {
        if (!response.data) {
            console.log('Response data not present. Response output (Next Line):');
            console.log(response);
            return;
        }
        response.data.map(async (server: any) => await this.parse_single_server(server));
        console.log('Successfully parsed server list data.');
    }

    async parse_single_server(server: any): Promise<void> {
        this.servers_parsed++;
        const attrs = server.attributes;
        if (!attrs) {
            this.servers_skipped++;
            return;
        }

        let { id, ip, port, rank, name, players, max_players, details, rust_description, rust_last_wipe } = attrs;
        let rust_next_wipe_map, rust_next_wipe_full, rust_next_wipe_bp, rust_next_wipe, next_wipe_is_bp;

        const extra_debug = false;
        if (extra_debug) {
            console.log(`*`.repeat(140));
            console.log(`*`.repeat(20) + ` Attributes for Server ${id} ${name} ` + `-`.repeat(20));
            console.log(`Server ${id} ${name} Full Attributes (Next Line):`);
            for (const [key, value] of Object.entries(attrs)) {
                console.log(`${key}: ${value}`);
            }

            console.log(`-`.repeat(20) + ` Details ` + `-`.repeat(20));
            for (const [key, value] of Object.entries(details)) {
                console.log(`${key}: ${value}`);
            }
        }

        rust_description = details ? details.rust_description : '';
        rust_last_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe_map = details ? details.rust_next_wipe_map : null;
        rust_next_wipe_full = details ? details.rust_next_wipe_full : null;
        rust_next_wipe_bp = details ? details.rust_next_wipe_bp : null;

        rust_next_wipe = rust_next_wipe_map ? rust_next_wipe_map : rust_next_wipe;
        rust_next_wipe_full = rust_next_wipe_bp ? rust_next_wipe_bp : rust_next_wipe_full;
        rust_next_wipe = rust_next_wipe ? moment.utc(new Date(rust_next_wipe)).tz('America/Los_Angeles').format(BM_DATE_FORMAT) : null;
        rust_next_wipe_full = rust_next_wipe_full
            ? moment.utc(new Date(rust_next_wipe_full)).tz('America/Los_Angeles').format(BM_DATE_FORMAT)
            : null;

        // check if next wipe is force wipe by comparing which date from rust_next_wipe or rust_next_wipe_full is closer to current date
        next_wipe_is_bp = false;
        if (rust_next_wipe && rust_next_wipe_full) {
            const next_wipe_moment = moment(new Date(rust_next_wipe));
            const next_wipe_full_moment = moment(new Date(rust_next_wipe_full));
            const current_moment = moment().tz('America/Los_Angeles');

            const next_wipe_diff = Math.abs(next_wipe_moment.diff(current_moment));
            const next_wipe_full_diff = Math.abs(next_wipe_full_moment.diff(current_moment));

            next_wipe_is_bp = next_wipe_diff > next_wipe_full_diff;
        }

        console.log(`-`.repeat(20) + ` Parsed Attrs ` + `-`.repeat(20));
        console.log(`BM ID: ${id} | Name: ${name}`);
        // console.log(`IP: ${ip} | Port: ${port}`);
        // console.log(`Rank: ${rank} | Players: ${players}/${max_players}`);
        // console.log(`Rust Next Wipe: ${rust_next_wipe ? rust_next_wipe : 'N/A'}`);
        // console.log(`Rust Next Wipe Full: ${rust_next_wipe_full ? rust_next_wipe_full : 'N/A'}`);
        // console.log(`Next Wipe is BP: ${next_wipe_is_bp}`);

        // Server exclusion logic
        // Rank of server greater than set min rank
        if (rank > this.min_rank) {
            console.log(`Not saving servers with rank > ${this.min_rank} in DB. Skipping ${name}. Amount skipped: ${this.servers_skipped}`);
            this.servers_skipped++;
            return;
        }

        // console.log('Rust Description:\n', rust_description);

        // parse server attributes
        const server_attributes = parse_server_attributes(name, rust_description);
        // console.log('Server Attributes:\n', server_attributes);

        // parse grouped attributes for max
        const [max_attributes, server_attribute_stats] = parse_grouped_attributes_for_max(server_attributes);
        console.log('Max Attributes: ', max_attributes);
        console.log('Server Attribute Stats: ', server_attribute_stats);

        let wipe_times: WipeHistory[] = [];
        try {
            // Check if the wipe time exists in the database
            let wipe_time_row = await db
                .select()
                .from(rw_wipe_history)
                .where(and(eq(rw_wipe_history.bm_id, parseInt(id)), eq(rw_wipe_history.wipe_time, rust_last_wipe)))
                .limit(1)
                .execute();

            // If the wipe time doesn't exist, insert it
            if (!wipe_time_row) {
                await db
                    .insert(rw_wipe_history)
                    .values({
                        bm_id: parseInt(id),
                        wipe_time: rust_last_wipe,
                        is_bp: next_wipe_is_bp ? 'true' : 'false',
                        title: name,
                        description: rust_description,
                        attributes: JSON.stringify(max_attributes),
                    })
                    .execute();
            }

            // pull wipe_time field for all records with id = server.id
            wipe_times = (await db
                .select({ wipe_time: rw_wipe_history.wipe_time })
                .from(rw_wipe_history)
                .where(eq(rw_wipe_history.bm_id, parseInt(id)))
                .execute()) as WipeHistory[];
        } catch (error) {
            console.error('Error executing database query:', error);
        }

        // append current wipe_time to wipe_times
        wipe_times.push(rust_last_wipe);
        // console.log('Finding main/secondary wipes for found wipe times: ', wipe_times);

        // if wipe_times.length > 1, loop through and find the most frequest wipe date, second most frequent wipe date, and most frequent bp wipe date
        // BP wipe date = first thursday of each month
        // for most frequent wipe date / second most frequent wipe date / most frequent bp wipe date, use moment.js to get the rounded hour of the day, and the day of the week
        if (wipe_times.length < 1) {
            console.log('No wipe times found for server. Skipping...');
            this.servers_skipped++;
            return;
        }
        let [main_wipe_hour, main_wipe_dow, sec_wipe_hour, sec_wipe_dow, bp_wipe_hour, bp_wipe_dow] = await this.capture_wipe_times(
            wipe_times
        );

        // combine server_attribute_stats with this.server_attribute_stats
        // console.log('Combining server_attribute_stats with this.server_attribute_stats');
        Object.entries(server_attribute_stats).forEach(([attribute, count]) => {
            if (!this.server_attribute_stats[attribute]) {
                this.server_attribute_stats[attribute] = typeof count === 'number' ? count : 0;
            } else {
                this.server_attribute_stats[attribute] += count;
            }
        });

        var next_wipe_hour = '-1';
        var next_wipe_dow = '-1';
        var next_wipe_week = '-1';
        if (rust_next_wipe !== null) {
            let pstMoment = moment.utc(rust_next_wipe).tz('America/Los_Angeles');
            next_wipe_hour = pstMoment.format('H'); // 0-23
            next_wipe_dow = pstMoment.format('d'); // 0 = Sunday, 6 = Saturday
            next_wipe_week = pstMoment.format('W'); // 1-52
        }

        const dataToInsert = {
            bm_id: parseInt(id),
            rank: rank,
            ip: `${ip}:${port}`,
            title: name,
            region: this.country,
            players: players,
            attributes: max_attributes,
            last_wipe: rust_last_wipe,
            next_wipe: next_wipe_is_bp ? rust_next_wipe_full : rust_next_wipe,
            next_wipe_full: rust_next_wipe_full,
            next_wipe_is_bp: next_wipe_is_bp,
            next_wipe_hour: next_wipe_hour,
            next_wipe_dow: next_wipe_dow,
            next_wipe_week: next_wipe_week,
            main_wipe_hour: main_wipe_hour,
            main_wipe_dow: main_wipe_dow,
            sec_wipe_hour: sec_wipe_hour,
            sec_wipe_dow: sec_wipe_dow,
            bp_wipe_hour: bp_wipe_hour,
            bp_wipe_dow: bp_wipe_dow,
        };
        // console.log('Data to Insert:', dataToInsert);

        // pull current data for BM ID and if data from current data is better than new data, only update fields that are better
        const final_data_to_insert = await search_for_existing_and_combine(id, dataToInsert);

        // console.log(`Final ${id} Data to Insert:`, final_data_to_insert);
        console.log(
            `Insterting bm_id ${id} with attr keys: [${Object.keys(
                max_attributes
            )}] | main_wipe_hour: ${main_wipe_hour} | main_wipe_dow: ${main_wipe_dow} | sec_wipe_hour: ${sec_wipe_hour} | sec_wipe_dow: ${sec_wipe_dow} | bp_wipe_hour: ${bp_wipe_hour} | bp_wipe_dow: ${bp_wipe_dow}`
        );
        await insert_into_db(final_data_to_insert);
        this.servers_posted++;
    }

    async capture_wipe_times(
        wipe_times: {
            id: number;
            bm_id: number | null;
            timestamp: Date | null;
            wipe_time: string | null;
            is_bp: string | null;
            title: string | null;
            description: string | null;
            attributes: string | null;
        }[]
    ): Promise<[string, string, string, string, string, string]> {
        let main_wipe_hour = '';
        let main_wipe_dow = '';
        let sec_wipe_hour = '';
        let sec_wipe_dow = '';
        let bp_wipe_hour = '';
        let bp_wipe_dow = '';

        var normal_wipe_dates_count: { [key: string]: number } = {};
        var bp_wipe_dates_count: { [key: string]: number } = {};
        for (const wipe_time of wipe_times) {
            let final_wipe_time = typeof wipe_time === 'string' ? wipe_time : wipe_time.wipe_time;
            if (final_wipe_time !== null) {
                let wipe_moment = moment.utc(final_wipe_time).tz('America/Los_Angeles');
                // check if first thursday of the month
                if (wipe_moment.date() <= 7 && wipe_moment.day() === 4 && wipe_moment.hour() > 6) {
                    bp_wipe_dates_count[final_wipe_time] = (bp_wipe_dates_count[final_wipe_time] || 0) + 1;
                } else {
                    normal_wipe_dates_count[final_wipe_time] = (normal_wipe_dates_count[final_wipe_time] || 0) + 1;
                }
            }
        }
        // console.log('Normal Wipe Dates Count:', normal_wipe_dates_count);
        // console.log('BP Wipe Dates Count:', bp_wipe_dates_count);

        // Capture highest count / second highest count date from normal_wipe_dates_count
        // Capture highest count date from bp_wipe_dates_count
        let sorted_normal_wipes = Object.entries(normal_wipe_dates_count).sort((a, b) => b[1] - a[1]);
        let sorted_bp_wipes = Object.entries(bp_wipe_dates_count).sort((a, b) => b[1] - a[1]);

        if (sorted_normal_wipes.length > 0) {
            let main_wipe_date = sorted_normal_wipes[0][0];
            if (main_wipe_date) {
                let main_moment = moment.utc(main_wipe_date).tz('America/Los_Angeles');
                main_wipe_hour = main_moment.format('H');
                main_wipe_dow = main_moment.format('d');
            }

            if (sorted_normal_wipes.length > 1) {
                let sec_wipe_date = sorted_normal_wipes[1][0];
                if (sec_wipe_date) {
                    let sec_moment = moment.utc(sec_wipe_date).tz('America/Los_Angeles');
                    sec_wipe_hour = sec_moment.format('H');
                    sec_wipe_dow = sec_moment.format('d');
                }
            }
        }

        if (sorted_bp_wipes.length > 0) {
            let bp_wipe_date = sorted_bp_wipes[0][0];

            if (bp_wipe_date) {
                let bp_moment = moment.utc(bp_wipe_date).tz('America/Los_Angeles');
                bp_wipe_hour = bp_moment.format('H');
                bp_wipe_dow = bp_moment.format('d');
            }
        }

        // console.log(
        //     `Returning Main Wipe Hour: ${main_wipe_hour} | Main Wipe DOW: ${main_wipe_dow} | Sec Wipe Hour: ${sec_wipe_hour} | Sec Wipe DOW: ${sec_wipe_dow} | BP Wipe Hour: ${bp_wipe_hour} | BP Wipe DOW: ${bp_wipe_dow}`
        // );

        return [main_wipe_hour, main_wipe_dow, sec_wipe_hour, sec_wipe_dow, bp_wipe_hour, bp_wipe_dow];
    }

    async run_all_servers(): Promise<void> {
        let hasMorePages = true;
        let nextPageUrl = create_bm_server_list_api_call_string(this.country, this.distance, this.min_players, this.page_length); // Start with the initial URL

        while (hasMorePages) {
            console.log('Fetching next page at:', nextPageUrl);
            let data = await fetch_api_url(nextPageUrl);
            if (!data || !data.data) {
                console.log('No data found. Exiting scrapper...');
                hasMorePages = false;
                break;
            }

            console.log('Parsing server list data...');
            await this.parse_server_list_data(data);

            // Check if there's a "next" link for pagination
            console.log(`data.links.next: ${data.links.next}`);
            nextPageUrl = data.links && data.links.next ? data.links.next : null;
            hasMorePages = !!nextPageUrl; // Continue if there's a next page

            if (hasMorePages) {
                console.log('Pausing for 5 seconds...');
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }
}

export default BaseScrapper;
