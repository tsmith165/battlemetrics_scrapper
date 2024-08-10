# Rust Server Scraper

This project is a server scraper for Rust game servers, which collects and stores information about various Rust servers using the BattleMetrics API.

## Prerequisites

-   Ubuntu Server (20.04 LTS or later recommended)
-   Node.js (v18 or later)
-   npm (usually comes with Node.js)
-   Git

## Installation

1. Update your system:

    ```bash
    sudo apt update && sudo apt upgrade -y
    ```

2. Install Node.js and npm:

    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```

3. Install Git:

    ```bash
    sudo apt install git -y
    ```

4. Clone the repository:

    ```bash
    cd /root/scripts
    git clone https://github.com/yourusername/rust-server-scraper.git
    cd rust-server-scraper
    ```

5. Install dependencies:
    ```bash
    npm install
    ```

## Configuration

1. Create a `.env` file in the project root:

    ```bash
    cp .env.example .env
    ```

2. Edit the `.env` file with your actual values:

    ```bash
    nano .env
    ```

    Update the following variables:

    ```
    NEON_DATABASE_URL=your_neon_database_url
    RESEND_API_KEY=your_resend_api_key
    ADMIN_EMAIL=your_admin_email@example.com
    ```

## Setting up the Systemd Service

1. Create a systemd service file:

    ```bash
    sudo nano /etc/systemd/system/rust-server-scraper.service
    ```

2. Add the following content to the file:

    ```
    [Unit]
    Description=Rust Server Scraper
    After=network.target

    [Service]
    ExecStart=/usr/bin/node /root/scripts/rust-server-scraper/tests/run_scrapper.js
    Restart=always
    User=root
    Environment=PATH=/usr/bin:/usr/local/bin
    Environment=NODE_ENV=production
    WorkingDirectory=/root/scripts/rust-server-scraper

    [Install]
    WantedBy=multi-user.target
    ```

3. Save and close the file.

4. Reload the systemd daemon:

    ```bash
    sudo systemctl daemon-reload
    ```

5. Enable the service to start on boot:

    ```bash
    sudo systemctl enable rust-server-scraper
    ```

6. Start the service:
    ```bash
    sudo systemctl start rust-server-scraper
    ```

## Managing the Service

-   To check the status of the service:

    ```bash
    sudo systemctl status rust-server-scraper
    ```

-   To stop the service:

    ```bash
    sudo systemctl stop rust-server-scraper
    ```

-   To restart the service:

    ```bash
    sudo systemctl restart rust-server-scraper
    ```

-   To view logs:
    ```bash
    sudo journalctl -u rust-server-scraper
    ```

## Updating the Scraper

1. Pull the latest changes:

    ```bash
    cd /root/scripts/rust-server-scraper
    git pull origin main
    ```

2. Install any new dependencies:

    ```bash
    npm install
    ```

3. Restart the service:
    ```bash
    sudo systemctl restart rust-server-scraper
    ```

## Troubleshooting

-   If the service fails to start, check the logs for error messages:

    ```bash
    sudo journalctl -u rust-server-scraper -n 50 --no-pager
    ```

-   Ensure that all environment variables in the `.env` file are correctly set.

-   Verify that the Node.js version is compatible with the project requirements:
    ```bash
    node --version
    ```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
