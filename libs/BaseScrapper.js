// /libs/BaseScrapper.js
require('module-alias/register');
const moment = require('moment-timezone');

const { BM_DATE_FORMAT } = require('@utils/bm_scrapper_constants');
const { create_db_connection } = require('@helpers/db_connection_helper');
const { insert_scrapper_stats, output_stats } = require('@helpers/scrapper_stats_helper');
const {
    parse_server_attributes,
    parse_grouped_attributes_for_max,
    search_for_existing_and_combine,
    insert_into_db,
    fetch_api_url,
    create_bm_server_list_api_call_string,
} = require('@helpers/scrapper_generic_helper');

class BaseScrapper {
    constructor(options = {}) {
        this.prisma = null;

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

        this.fetch_api_url = fetch_api_url;
        this.create_bm_server_list_api_call_string = create_bm_server_list_api_call_string;
        this.output_stats = output_stats;
        this.insert_scrapper_stats = insert_scrapper_stats;
    }

    async run() {
        console.log('DB URL:', process.env.PS_DATABASE_URL);

        this.prisma = await create_db_connection(process.env.PS_DATABASE_URL);
        if (!this.prisma) {
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
    async run_scrapper() {
        throw new Error('run_scrapper() must be implemented by subclasses');
    }

    async parse_server_list_data(response) {
        if (!response.data) {
            console.log('Response data not present. Response output (Next Line):');
            console.log(response);
            return;
        }
        response.data.map((server) => this.parse_single_server(server));
    }

    async parse_single_server(server) {
        this.servers_parsed++;
        const attrs = server.attributes;
        if (!attrs) {
            this.servers_skipped++;
            return;
        }

        var { id, ip, port, rank, name, players, max_players, details, rust_description, rust_last_wipe } = attrs;
        var rust_next_wipe_map, rust_next_wipe_full, rust_next_wipe_bp, rust_next_wipe, next_wipe_is_bp;

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
        console.log(`IP: ${ip} | Port: ${port}`);
        console.log(`Rank: ${rank} | Players: ${players}/${max_players}`);
        console.log(`Rust Next Wipe: ${rust_next_wipe ? rust_next_wipe : 'N/A'}`);
        console.log(`Rust Next Wipe Full: ${rust_next_wipe_full ? rust_next_wipe_full : 'N/A'}`);
        console.log(`Next Wipe is BP: ${next_wipe_is_bp}`);

        // Server exclusion logic
        // Rank of server greater than set min rank
        if (rank > this.min_rank) {
            console.log(`Not saving servers with rank > ${this.min_rank} in DB. Skipping ${name}. Amount skipped: ${this.servers_skipped}`);
            this.servers_skipped++;
            return;
        }

        console.log('Rust Description:\n', rust_description);

        // parse server attributes
        const server_attributes = parse_server_attributes(name, rust_description);
        console.log('Server Attributes:\n', server_attributes);

        // parse grouped attributes for max
        const [max_attributes, server_attribute_stats] = parse_grouped_attributes_for_max(server_attributes);
        console.log('Max Attributes:\n', max_attributes);
        console.log('Server Attribute Stats:\n', server_attribute_stats);

        // Check if the wipe time exists in the database
        const wipeTimeExists = await this.prisma.wipe_history.findFirst({
            where: {
                bm_id: parseInt(id),
                wipe_time: rust_last_wipe, // Assuming this is the wipe time
            },
        });

        // If the wipe time doesn't exist, insert it
        if (!wipeTimeExists) {
            await this.prisma.wipe_history.create({
                data: {
                    bm_id: parseInt(id),
                    wipe_time: rust_last_wipe,
                    is_bp: next_wipe_is_bp ? 'true' : 'false',
                    title: name,
                    description: rust_description,
                    attributes: max_attributes,
                },
            });
        }

        // pull wipe_time field for all records with id = server.id
        const wipe_times = await this.prisma.wipe_history.findMany({
            where: {
                id: parseInt(id),
            },
            select: {
                wipe_time: true,
            },
        });

        // append current wipe_time to wipe_times
        wipe_times.push(rust_last_wipe);
        console.log('Finding main/secondary wipes for found wipe times: ', wipe_times);

        // if wipe_times.length > 1, loop through and find the most frequest wipe date, second most frequent wipe date, and most frequent bp wipe date
        // BP wipe date = first thursday of each month
        // for most frequent wipe date / second most frequent wipe date / most frequent bp wipe date, use moment.js to get the rounded hour of the day, and the day of the week
        var main_wipe_hour, main_wipe_dow, sec_wipe_hour, sec_wipe_dow, bp_wipe_hour, bp_wipe_dow;

        if (wipe_times.length > 0) {
            var normal_wipe_dates_count = {};
            var bp_wipe_dates_count = {};
            for (const wipe_time of wipe_times) {
                let wipe_moment = moment.utc(wipe_time).tz('America/Los_Angeles');
                // check if first thursday of the month
                if (wipe_moment.date() <= 7 && wipe_moment.day() === 4 && wipe_moment.hour() > 10) {
                    bp_wipe_dates_count[wipe_time] = (bp_wipe_dates_count[wipe_time] || 0) + 1;
                } else {
                    normal_wipe_dates_count[wipe_time] = (normal_wipe_dates_count[wipe_time] || 0) + 1;
                }
            }
            console.log('Normal Wipe Dates Count:', normal_wipe_dates_count);
            console.log('BP Wipe Dates Count:', bp_wipe_dates_count);

            // Capture highest count / second highest count date from normal_wipe_dates_count
            // Capture highest count date from bp_wipe_dates_count
            let sorted_normal_wipes = Object.entries(normal_wipe_dates_count).sort((a, b) => b[1] - a[1]);
            let sorted_bp_wipes = Object.entries(bp_wipe_dates_count).sort((a, b) => b[1] - a[1]);

            console.log('Sorted Normal Wipes:', sorted_normal_wipes);
            console.log('Sorted BP Wipes:', sorted_bp_wipes);

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
        }

        // combine server_attribute_stats with this.server_attribute_stats
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

        console.log(`Using main wipe hour ${main_wipe_hour} - dow ${main_wipe_dow}`);
        console.log(`Using secondary wipe hour ${sec_wipe_hour} - dow ${sec_wipe_dow}`);

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

        // pull current data for BM ID and if data from current data is better than new data, only update fields that are better
        const final_data_to_insert = await search_for_existing_and_combine(this.prisma, id, dataToInsert);

        // console.log(`Final ${id} Data to Insert:`, final_data_to_insert);
        await insert_into_db(this.prisma, final_data_to_insert);
        this.servers_posted++;
    }

    async run_all_servers() {
        let hasMorePages = true;
        let nextPageUrl = this.create_bm_server_list_api_call_string(this.country, this.distance, this.min_players, this.page_length); // Start with the initial URL

        while (hasMorePages) {
            const data = await this.fetch_api_url(nextPageUrl);
            if (data && data.data) {
                await this.parse_server_list_data(data);
                console.log(`data.links.next: ${data.links.next}`);
                // Check if there's a "next" link for pagination
                nextPageUrl = data.links && data.links.next ? data.links.next : null;
                hasMorePages = !!nextPageUrl; // Continue if there's a next page
            } else {
                hasMorePages = false; // Stop if no data or next link
            }

            if (hasMorePages) {
                console.log('Fetching next page...');
            } else {
                console.log('No more pages to fetch.');
            }
        }
    }
}

module.exports = BaseScrapper;
