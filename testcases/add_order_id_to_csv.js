// Add sequential order_id to testcases_with_timestamps.csv
// Usage: node add_order_id_to_csv.js

const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'testcases_with_timestamps.csv');
const outputFile = path.join(__dirname, 'testcases_with_timestamps_with_orderid.csv');

const csv = fs.readFileSync(inputFile, 'utf8').split(/\r?\n/);
if (csv.length < 2) {
  console.error('CSV file is empty or missing header.');
  process.exit(1);
}

const header = csv[0].trim();
const rows = csv.slice(1).filter(line => line.trim().length > 0);

const newHeader = 'order_id,' + header;
const newRows = rows.map((row, idx) => `${1000000 + idx},${row}`);

const output = [newHeader, ...newRows].join('\n');
fs.writeFileSync(outputFile, output);
console.log('New CSV with order_id written to:', outputFile);
