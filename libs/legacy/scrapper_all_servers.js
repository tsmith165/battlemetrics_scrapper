// /lib/battlemetrics_scrapper/scrapper_single.js

const moment = require('moment');
const { PrismaClient } = require('@prisma/client');

console.log(`Scrapper Single DB URL: ${process.env.PS_DATABASE_URL}`);
const prisma = new PrismaClient();

const {
    BM_API_BASE_URL,
    BASE_FILTER,
    COUNTRY_FILTER,
    DISTANCE_FILTER,
    PLAYERS_FILTER,
    PAGE_LEN_FILTER,
    PAGE_KEY_FILTER,
    MY_DATE_FORMAT,
    BM_DATE_FORMAT,
} = require('@utils/bm_scrapper_constants');
const { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYWORDS } = require('@utils/bm_scrapper_attributes');
const { fetch_api_url, count_keywords_in_string } = require('@helpers/scrapper_generic_helper');
const { insert_scrapper_stats, output_stats } = require('@helpers/scrapper_stats_helper');
const { create_db_connection } = require('@helpers/db_connection_helper');

class AllServersScrapper {
    constructor() {
        this.page_length = 25; // fetch the most recent 25 bm servers only
        this.distance = 5000;
        this.min_players = 2;
        this.country = 'US';
        this.start_time = null;
        this.end_time = null;
        this.servers_parsed = 0;
        this.servers_posted = 0;
        this.servers_skipped = 0;
        this.server_attribute_stats = {};
        this.bufferLogs = false;
    }
    async run() {
        const db_url = process.env.PS_DATABASE_URL;
        console.log('DB URL:', db_url);

        const dbConnected = await create_db_connection(process.env.PS_DATABASE_URL);
        if (!dbConnected) {
            console.log('Failed to connect to Database. Exiting scrapper...');
            return;
        }

        // Start the scrapper
        await this.run_scrapper(); // This is your existing method to run the scrapper
        console.log('Scrapper run completed. Next run scheduled after interval.');
    }

    async run_scrapper() {
        this.servers_parsed = 0;
        this.servers_posted = 0;
        this.servers_skipped = 0;
        this.server_attribute_stats = {};
        this.start_time = moment();
        this.end_time = null;

        let nextPageUrl = this.create_bm_server_list_api_call_string(); // Start with the initial URL
        let hasMore = true;

        while (hasMore && nextPageUrl) {
            const data = await fetch_api_url(nextPageUrl); // Use the full URL directly
            if (data && data.data.length > 0) {
                await this.parse_server_list_data(data);
                // Extract the next page URL from the response, if available
                nextPageUrl = data.links && data.links.next ? data.links.next : null;
                hasMore = !!nextPageUrl;
            } else {
                hasMore = false;
            }

            if (hasMore) {
                // Wait to comply with the rate limit, if necessary
                console.log('Waiting for 5 seconds before fetching the next page...');
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }

        this.end_time = moment();
        // Output and insert stats as before
    }

    async parse_server_list_data(response) {
        if (!response.data) {
            this.log('Response data not present. Response output (Next Line):');
            this.log(response);
            return;
        }

        this.bufferLogs = true; // Start buffering logs

        const tasks = response.data.map((server) => this.parse_single_server(server));
        await Promise.all(tasks);

        this.bufferLogs = false; // Stop buffering logs
        this.flushLogs(); // Flush the buffered logs
    }

    async parse_single_server(server) {
        this.servers_parsed++;
        const attrs = server.attributes;
        if (!attrs) {
            this.servers_skipped++;
            return;
        }

        var { id, rank, name, players, max_players, details, rust_description, rust_last_wipe } = attrs;
        var rust_next_wipe_map, rust_next_wipe_full, rust_next_wipe_bp, rust_next_wipe, next_wipe_is_bp;

        const extra_debug = false;
        if (extra_debug) {
            this.log(`*`.repeat(140));
            this.log(`*`.repeat(20) + ` Attributes for Server ${id} ${name} ` + `-`.repeat(20));
            this.log(`Server ${id} ${name} Full Attributes (Next Line):`);
            for (const [key, value] of Object.entries(attrs)) {
                this.log(`${key}: ${value}`);
            }

            this.log(`-`.repeat(20) + ` Details ` + `-`.repeat(20));
            for (const [key, value] of Object.entries(details)) {
                this.log(`${key}: ${value}`);
            }
        }

        rust_description = details ? details.rust_description : '';
        rust_last_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe_map = details ? details.rust_next_wipe_map : null;
        rust_next_wipe_full = details ? details.rust_next_wipe_full : null;
        rust_next_wipe_bp = details ? details.rust_next_wipe_bp : null;

        rust_next_wipe = rust_next_wipe_map ? rust_next_wipe_map : rust_next_wipe;
        rust_next_wipe = rust_next_wipe ? moment(new Date(rust_next_wipe)).format(BM_DATE_FORMAT) : null;
        rust_next_wipe_full = rust_next_wipe_bp ? rust_next_wipe_bp : rust_next_wipe_full;
        rust_next_wipe_full = rust_next_wipe_full ? moment(new Date(rust_next_wipe_full)).format(BM_DATE_FORMAT) : null;

        // check if next wipe is force wipe by comparing which date from rust_next_wipe or rust_next_wipe_full is closer to current date
        next_wipe_is_bp = false;
        if (rust_next_wipe && rust_next_wipe_full) {
            const next_wipe_moment = moment(new Date(rust_next_wipe));
            const next_wipe_full_moment = moment(new Date(rust_next_wipe_full));
            const current_moment = moment();

            const next_wipe_diff = Math.abs(next_wipe_moment.diff(current_moment));
            const next_wipe_full_diff = Math.abs(next_wipe_full_moment.diff(current_moment));

            next_wipe_is_bp = next_wipe_diff > next_wipe_full_diff;
        }

        this.log(`-`.repeat(20) + ` Parsed Attrs ` + `-`.repeat(20));
        this.log(`BM ID: ${id} | Name: ${name}`);
        this.log(`Rank: ${rank} | Players: ${players}/${max_players}`);
        this.log(`Rust Next Wipe: ${rust_next_wipe ? rust_next_wipe : 'N/A'}`);
        this.log(`Rust Next Wipe Full: ${rust_next_wipe_full ? rust_next_wipe_full : 'N/A'}`);
        this.log(`Next Wipe is BP: ${next_wipe_is_bp}`);

        // Server exclusion logic
        // Rank of server greater than set min rank
        if (rank > this.min_rank) {
            this.log(`Not saving servers with rank > ${this.min_rank} in DB. Skipping ${name}. Amount skipped:', this.servers_skipped`);
            this.servers_skipped++;
            return;
        }

        // console.log('Rust Description:\n', rust_description);

        const serverAttributes = this.parse_server_attributes(name, rust_description);
        // console.log('Server Attributes:\n', serverAttributes);

        const maxAttributes = this.parse_grouped_attributes_for_max(serverAttributes);
        // console.log('Max Attributes:\n', maxAttributes);

        const dataToInsert = {
            bm_id: id,
            rank: rank,
            title: name,
            attributes: maxAttributes,
            last_wipe: rust_last_wipe,
            next_wipe: next_wipe_is_bp ? rust_next_wipe_full : rust_next_wipe,
            next_wipe_full: rust_next_wipe_full,
            next_wipe_is_bp: next_wipe_is_bp,
        };

        await this.insert_into_db(dataToInsert);
        this.servers_posted++;
    }

    async insert_into_db(data) {
        const { bm_id, rank, title, attributes, last_wipe, next_wipe, next_wipe_full, next_wipe_is_bp } = data;
        const { game_mode, wipe_schedule, resource_rate, group_limit } = attributes;

        // Check if the server already exists in the DB
        const existing_data = await prisma.server_parsed.findUnique({
            where: { id: parseInt(bm_id, 10) },
        });
        const new_record = existing_data ? false : true;

        // Use Prisma for DB Operations
        if (new_record) {
            // Insert into server_parsed
            await prisma.server_parsed.create({
                data: {
                    id: parseInt(bm_id, 10),
                    rank: rank,
                    title: title,
                    region: typeof attributes.region === String ? attributes.region : 'N/A',
                    wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                    game_mode: game_mode || null,
                    resource_rate: resource_rate || null,
                    group_limit: group_limit || null,
                    last_wipe: last_wipe || null,
                    next_wipe: next_wipe || null,
                    next_wipe_full: next_wipe_full || null,
                    next_wipe_is_bp: next_wipe_is_bp || null,
                },
            });
        } else {
            await prisma.server_parsed.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    rank: rank,
                    title: title,
                    region: typeof attributes.region === String ? attributes.region : 'N/A',
                    wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                    game_mode: game_mode || null,
                    resource_rate: resource_rate || null,
                    group_limit: group_limit || null,
                    last_wipe: last_wipe || null,
                    next_wipe: next_wipe || null,
                    next_wipe_full: next_wipe_full || null,
                    next_wipe_is_bp: next_wipe_is_bp || null,
                },
            });
        }
    }

    async search_existing(bm_id, wipe_time, force_wipe = false) {
        const field_str = force_wipe ? 'force_wipes' : 'wipes';
        const server_data = await prisma.server_data.findUnique({
            where: { id: parseInt(bm_id, 10) },
            select: { wipes: true, force_wipes: true },
        });

        let new_record = false;

        if (!server_data) {
            this.log(`No existing records found matching Battle Metrics ID: ${bm_id}`);
            new_record = true;

            const wipeMoment = moment(wipe_time);
            const wipe = wipeMoment.format(MY_DATE_FORMAT);
            const weekday = wipeMoment.isoWeekday();
            let hour = wipeMoment.hour();
            const minute = wipeMoment.minute();
            if (minute > 45) hour += 1;

            return [[wipe_time], [weekday, hour, wipe], [null, null, null], new_record];
        }

        this.log(`Found pre-existing data in our DB for Battle Metrics ID: ${bm_id}`);

        var wipe_array = force_wipe ? server_data.force_wipes : server_data.wipes;

        if (typeof wipe_array === 'string') {
            wipe_array = [wipe_array];
        } else if (!wipe_array) {
            this.log('Wipe array is null. Creating a new array...');
            wipe_array = []; // initialize it as an empty array
        }

        if (wipe_array.includes(wipe_time)) {
            this.log('Wipe time already exists in wipe array. Skipping...');
            return [null, null, null, false];
        }

        this.log('Wipe time does not exist in wipe array. Adding current wipe time to wipe array...');
        wipe_array.unshift(wipe_time);

        const wipe_dict = this.create_wipe_timestamp_dict(wipe_array, false);
        const { most_frequent_wipe, second_frequent_wipe } = this.determine_frequent_wipes(wipe_dict);

        return [wipe_array, most_frequent_wipe, second_frequent_wipe, new_record];
    }

    determine_frequent_wipes(wipe_dict) {
        let most_frequent_day = null;
        let most_frequent_hour = null;
        let most_frequent_hour_count = null;
        let most_frequent_timestamp = null;

        let second_frequent_day = null;
        let second_frequent_hour = null;
        let second_frequent_hour_count = null;
        let second_frequent_timestamp = null;

        for (const [day, hours] of Object.entries(wipe_dict)) {
            const first_timestamp = hours['first_timestamp'];

            for (const [hour, hour_count] of Object.entries(hours)) {
                if (hour === 'first_timestamp') continue;

                if (most_frequent_hour_count === null) {
                    most_frequent_hour_count = hour_count;
                    most_frequent_day = day;
                    most_frequent_hour = hour;
                    most_frequent_timestamp = first_timestamp;
                } else if (hour_count > most_frequent_hour_count) {
                    second_frequent_hour_count = most_frequent_hour_count;
                    second_frequent_day = most_frequent_day;
                    second_frequent_hour = most_frequent_hour;
                    second_frequent_timestamp = most_frequent_timestamp;

                    most_frequent_hour_count = hour_count;
                    most_frequent_day = day;
                    most_frequent_hour = hour;
                    most_frequent_timestamp = first_timestamp;
                } else if (
                    second_frequent_hour_count === null ||
                    (hour_count > second_frequent_hour_count && hour !== most_frequent_hour)
                ) {
                    second_frequent_hour_count = hour_count;
                    second_frequent_day = day;
                    second_frequent_hour = hour;
                    second_frequent_timestamp = first_timestamp;
                }
            }
        }

        return {
            most_frequent_wipe: [most_frequent_day, most_frequent_hour, most_frequent_timestamp],
            second_frequent_wipe: [second_frequent_day, second_frequent_hour, second_frequent_timestamp],
        };
    }

    parse_grouped_attributes_for_max(serverAttributes) {
        const maxAttributes = {};

        for (const [groupKey, attributes] of Object.entries(serverAttributes)) {
            if (Object.keys(attributes).length === 0) {
                continue;
            }

            // Your group limit logic
            if (groupKey === 'group_limit') {
                for (const groupLimit of ['no limit', 'quad', 'trio', 'duo', 'solo']) {
                    if (attributes[groupLimit]) {
                        maxAttributes[groupKey] = groupLimit;
                        this.server_attribute_stats[groupLimit] = (this.server_attribute_stats[groupLimit] || 0) + 1;
                        break;
                    }
                }
                continue;
            }

            // Max attributes for other groups
            maxAttributes[groupKey] = Object.keys(attributes).reduce((a, b) => (attributes[a] > attributes[b] ? a : b));
            this.server_attribute_stats[maxAttributes[groupKey]] = (this.server_attribute_stats[maxAttributes[groupKey]] || 0) + 1;
        }

        return maxAttributes;
    }

    parse_server_attributes(title, description) {
        title = title.toLowerCase();
        description = description.toLowerCase();
        //this.log(`Title: ${title}`);

        const serverAttributes = {};
        for (const [groupKey, attributeKeys] of Object.entries(ATTRIBUTE_GROUPS)) {
            // this.log(`Searching title and description for group: ${groupKey} with attributes: ${attributeKeys}`);

            serverAttributes[groupKey] = {};
            this.server_attribute_stats[groupKey] = this.server_attribute_stats[groupKey] || {};

            attributeKeys.forEach((attribute) => {
                //console.log(`Searching for attribute: ${attribute}`);

                const keywords = ATTRIBUTE_KEYWORDS[attribute];
                const count = count_keywords_in_string(keywords, title) + count_keywords_in_string(keywords, description);
                if (count > 0) {
                    this.server_attribute_stats[groupKey][attribute] = (this.server_attribute_stats[groupKey][attribute] || 0) + count;
                }
            });
        }

        return serverAttributes;
    }

    create_wipe_timestamp_dict(wipe_array = [], logOut = false) {
        const wipeDict = {};

        for (const wipe of wipe_array) {
            if (!wipe) continue;

            const wipeDate = moment(wipe);
            const weekday = wipeDate.day() + 1; // Moment's day() gets the day of the week (0 = Sunday, 6 = Saturday). We want 1 = Monday, 7 = Sunday (I think?)
            const hour = wipeDate.hour();
            const minute = wipeDate.minute();

            let roundedHour = minute > 45 ? hour + 1 : hour;
            roundedHour = roundedHour > 23 ? 0 : roundedHour;

            if (logOut) this.log(`Cur day: ${weekday} | Cur Hour: ${roundedHour}`);

            if (!wipeDict[weekday]) {
                wipeDict[weekday] = { [roundedHour]: 1, first_timestamp: wipe };
            } else {
                if (!wipeDict[weekday][roundedHour]) {
                    wipeDict[weekday][roundedHour] = 1;
                } else {
                    wipeDict[weekday][roundedHour] += 1;
                }
            }
        }

        if (logOut) this.log(`WIPE DICT (NEXT LINE): \n${JSON.stringify(wipeDict)}`);
        return wipeDict;
    }

    create_bm_server_list_api_call_string() {
        const api_call_string = `${BM_API_BASE_URL}?${BASE_FILTER}&${COUNTRY_FILTER}=${this.country}&${DISTANCE_FILTER}=${this.distance}&${PLAYERS_FILTER}=${this.min_players}&${PAGE_LEN_FILTER}=50`;
        this.log(`Initial Server List API Call: ${api_call_string}`);
        return api_call_string;
    }
}

module.exports = AllServersScrapper;
