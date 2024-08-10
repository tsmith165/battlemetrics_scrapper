// File: /utils/emails/templates/StatsEmailTemplate.js

function StatsEmailTemplate({ totalServers, totalSkipped, totalPosted, avgDuration, errors }) {
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Daily Scrapper Stats Summary</title>
            </head>
            <body style="background-color: #f3f4f6; font-family: Arial, sans-serif;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                    <h1 style="text-align: center; color: #1f2937;">Daily Scrapper Stats Summary</h1>
                    <div>
                        <p>Total Servers Parsed: ${totalServers}</p>
                        <p>Total Servers Skipped: ${totalSkipped}</p>
                        <p>Total Servers Posted: ${totalPosted}</p>
                        <p>Average Duration: ${avgDuration.toFixed(2)} seconds</p>
                    </div>
                    ${
                        errors.length > 0
                            ? `
                        <div>
                            <h2 style="color: #ef4444;">Errors:</h2>
                            <ul>
                                ${errors.map((error) => `<li>${error}</li>`).join('')}
                            </ul>
                        </div>
                    `
                            : ''
                    }
                </div>
            </body>
        </html>
    `;
}

export default StatsEmailTemplate;
