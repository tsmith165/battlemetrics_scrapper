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
    constructor(options: ScrapperOptions) {
        super(options);
    }

    async run_scrapper(): Promise<void> {
        this.start_time = moment();

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
}

export default Scrapper;
