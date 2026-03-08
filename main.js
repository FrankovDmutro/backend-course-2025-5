// Adding commnnder and fs
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');

// Create a new commander program
const program = new Command();

// Define the command and its options
program
    //Removing help option since it is added by default
    .helpOption(false)
    .requiredOption('-h, --host <host>', 'Host to connect to')
    .requiredOption('-p, --port <port>', 'Port to connect to')
    .requiredOption('-c, --cache <cache>', 'Folder to store the cache')

// Parse the command line arguments
program.parse(process.argv);

// Get the options
const options = program.opts();

// Check if the cache folder exists, if not create it
if (!fs.existsSync(options.cache)) {
    fs.mkdirSync(options.cache);
}

// Log the options to the console
console.log('Host:', options.host);
console.log('Port:', options.port);
console.log('Cache Folder:', path.resolve(options.cache));