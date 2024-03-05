// /libs/scrapper_single.js

const BaseScrapper = require('./BaseScrapper');
const moment = require('moment');

class Scrapper extends BaseScrapper {
    constructor(options = {}) {
        super(options);
    }

    async run_scrapper() {
        this.start_time = moment();

        const api_url = this.create_bm_server_list_api_call_string(this.country, this.distance, this.min_players, this.page_length);

        const data = await this.fetch_api_url(api_url);
        if (data) {
            await this.parse_server_list_data(data);
        }

        this.end_time = moment();
        this.output_stats(
            this.start_time,
            this.end_time,
            this.servers_parsed,
            this.servers_skipped,
            this.servers_posted,
            this.server_attribute_stats
        );
        await this.insert_scrapper_stats(
            this.prisma,
            this.start_time,
            this.end_time,
            this.servers_parsed,
            this.servers_skipped,
            this.servers_posted
        );
        await this.prisma.$disconnect();
    }
}

module.exports = Scrapper;
