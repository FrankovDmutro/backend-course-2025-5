// Adding commnnder and fs
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

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

// Accept common shorthand aliases for localhost.
if (options.host === 'local') {
    options.host = 'localhost';
}

// Check if the cache folder exists, if not create it
if (!fs.existsSync(options.cache)) {
    fs.mkdirSync(options.cache);
}

// Log the options to the console
console.log('Host:', options.host);
console.log('Port:', options.port);
console.log('Cache Folder:', path.resolve(options.cache));

// Creating http server
const http = require('http');

const server = http.createServer(async (req, res) => {
    // Витягуємо назву файлу з URL (наприклад, /1.jpg -> 1.jpg)
    const fileName = path.basename(req.url);
    const filePath = path.join(options.cache, fileName);

    try {
        switch (req.method) {
            case 'GET':
                // Читаємо файл з папки кешу
                const data = await fsp.readFile(filePath);
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                res.end(data);
                break;

            case 'PUT':
                // Зберігаємо файл, який прийшов у тілі запиту
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                await fsp.writeFile(filePath, buffer);
                res.writeHead(201);
                res.end('File saved to cache');
                break;

            case 'DELETE':
                // Видаляємо файл з кешу
                await fsp.unlink(filePath);
                res.writeHead(200);
                res.end('File deleted from cache');
                break;

            default:
                res.writeHead(405);
                res.end('Method Not Allowed');
        }
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('File not found in cache');
        } else {
            res.writeHead(500);
            res.end(`Server Error: ${err.message}`);
        }
    }
});

server.listen(options.port, options.host, () => {
    console.log(`Server running at http://${options.host}:${options.port}/`);
    console.log(`Cache directory: ${path.resolve(options.cache)}`);
});

server.on('error', (err) => {
    if (err.code === 'ENOTFOUND') {
        console.error(`Unable to resolve host "${options.host}". Try "localhost" or "127.0.0.1".`);
    } else if (err.code === 'EADDRINUSE') {
        console.error(`Port ${options.port} is already in use.`);
    } else {
        console.error(`Server failed to start: ${err.message}`);
    }
    process.exit(1);
});