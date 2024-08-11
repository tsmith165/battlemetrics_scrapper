import { initializeStatsLogger } from '../utils/stats_logger.js';
import StatsEmailTemplate from '../utils/emails/templates/StatsEmailTemplate.js';
import { sendEmail } from '../utils/emails/resend_utils.js';
import dotenv from 'dotenv';

dotenv.config();

async function testStatsEmail() {
    // Sample data
    const sampleStats = {
        totalServers: 100,
        totalSkipped: 20,
        totalPosted: 80,
        avgDuration: 45.5,
        errors: ['Error 1', 'Error 2'],
    };

    const emailHtml = StatsEmailTemplate(sampleStats);

    try {
        await sendEmail({
            from: 'scrapper@rustwipes.net',
            to: process.env.ADMIN_EMAIL,
            subject: 'Test: Daily Scrapper Stats Summary',
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
