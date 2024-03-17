// /libs/Scrapper.ts
import BaseScrapper from './BaseScrapper.js';
import moment, { Moment } from 'moment';
import { create_bm_server_list_api_call_string, fetch_api_url } from '../helpers/scrapper_generic_helper.js';
import { output_stats, insert_scrapper_stats } from '../helpers/scrapper_stats_helper.js';

interface ScrapperOptions {
    max_days_old: number;
    min_rank: number;
    interval: boolean;
    all: boolean;
    country: string;
    min_players: number;
    page_length: number;
    distance: number;
}

class Scrapper extends BaseScrapper {
    start_time: Moment;
    end_time: Moment; // end_time might be null initially

    constructor(options: ScrapperOptions) {
        super(options);
        this.start_time = moment();
        this.end_time = moment();
    }

    async run_scrapper(): Promise<void> {
        const api_url = create_bm_server_list_api_call_string(this.country, this.distance, this.min_players, this.page_length);

        const data = await fetch_api_url(api_url);

        if (data) {
            await this.parse_server_list_data(data);
        }

        this.end_time = moment();

        output_stats(
            this.start_time,
            this.end_time,
            this.servers_parsed,
            this.servers_skipped,
            this.servers_posted,
            this.server_attribute_stats
        );

        await insert_scrapper_stats(this.start_time, this.end_time, this.servers_parsed, this.servers_skipped, this.servers_posted);
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

            output_stats(
                this.start_time,
                this.end_time,
                this.servers_parsed,
                this.servers_skipped,
                this.servers_posted,
                this.server_attribute_stats
            );

            await insert_scrapper_stats(this.start_time, this.end_time, this.servers_parsed, this.servers_skipped, this.servers_posted);

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

export default Scrapper;
