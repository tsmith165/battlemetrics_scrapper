const SingleScrapper = require('./scrapper_single.js');

async function runScrapperContinuously() {
    const scrapper = new SingleScrapper({
        max_days_old: 150,
        min_rank: 5000,
    });

    while (true) {
        // Infinite loop to continuously run the scrapper
        console.log(`run_single_scrapper DB URL: ${process.env.PS_DATABASE_URL}`);

        try {
            await scrapper.run();
            console.log('Scrapper has finished running.');
        } catch (err) {
            console.error('Something went wrong:', err);
        }

        console.log('Waiting for 5 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds before the next run
    }
}

runScrapperContinuously();
