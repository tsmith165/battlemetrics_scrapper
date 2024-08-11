import { initializeStatsLogger } from '../utils/stats_logger.js';
import StatsEmailTemplate from '../utils/emails/templates/StatsEmailTemplate.js';
import { sendEmail } from '../utils/emails/resend_utils.js';
import dotenv from 'dotenv';

dotenv.config();

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function testStatsEmail() {
    // Sample data
    const totalServers = randomInt(100, 1000);
    const totalSkipped = randomInt(0, totalServers);
    const totalPosted = randomInt(0, totalServers - totalSkipped);
    const sampleStats = {
        totalServers: totalServers,
        totalSkipped: totalSkipped,
        totalPosted: totalPosted,
        avgDuration: randomInt(0, 5),
        errors: [`Error ${randomInt(1, 10)}`, `Error ${randomInt(1, 10)}`],
    };

    const emailHtml = StatsEmailTemplate(sampleStats);

    const randomNumber = randomInt(1, 100);

    try {
        await sendEmail({
            from: 'scrapper@rustwipes.net',
            to: process.env.ADMIN_EMAIL,
            subject: `Test: Daily Scrapper Stats Summary ${randomNumber}`,
            html: emailHtml,
        });
        console.log('Test email sent successfully');
    } catch (error) {
        console.error('Error sending test email:', error);
    }
}

// Run the test
initializeStatsLogger();
testStatsEmail();
