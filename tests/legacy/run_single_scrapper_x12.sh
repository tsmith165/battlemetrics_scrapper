#!/bin/bash
# run_node_script.sh
for i in {1..12}; do
    echo "run_single_scrapper iteration $i"
    node /rust_wipes/battlemetrics_scrapper/run_single_scrapper.js
    sleep 5
done