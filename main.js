// Adding commnnder and fs
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const superagent = require('superagent');

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

function extractStatusCode(fileName) {
    const match = fileName.match(/(\d{3})/);
    return match ? match[1] : null;
}

function extensionFromContentType(contentType) {
    if (contentType && contentType.includes('image/png')) {
        return 'png';
    }
    if (contentType && contentType.includes('image/webp')) {
        return 'webp';
    }
    return 'jpg';
}

function contentTypeFromFileName(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.png') {
        return 'image/png';
    }
    if (ext === '.webp') {
        return 'image/webp';
    }
    return 'image/jpeg';
}

async function findCachedImageByStatusCode(statusCode) {
    const files = await fsp.readdir(options.cache);
    const found = files.find((name) => name.startsWith(`${statusCode}.`));
    return found ? path.join(options.cache, found) : null;
}

async function fetchCatImage(statusCode) {
    const response = await superagent
        .get(`https://http.cat/${statusCode}`)
        .buffer(true)
        .ok((res) => res.status >= 200 && res.status < 300);

    return {
        body: response.body,
        contentType: response.headers['content-type'] || 'image/jpeg'
    };
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
    const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    // Витягуємо назву файлу з URL (наприклад, /1.jpg -> 1.jpg)
    const fileName = path.basename(pathname);
    const filePath = path.join(options.cache, fileName);

    try {
        switch (req.method) {
            case 'GET':
                // Формат /200: дістаємо код зі шляху і працюємо з кешем за кодом.
                if (/^\d{3}$/.test(fileName)) {
                    const statusCode = fileName;
                    const cachedPath = await findCachedImageByStatusCode(statusCode);

                    if (cachedPath) {
                        const cachedData = await fsp.readFile(cachedPath);
                        res.writeHead(200, { 'Content-Type': contentTypeFromFileName(cachedPath) });
                        res.end(cachedData);
                        break;
                    }

                    try {
                        const catImage = await fetchCatImage(statusCode);
                        const ext = extensionFromContentType(catImage.contentType);
                        const cachedByCodePath = path.join(options.cache, `${statusCode}.${ext}`);
                        await fsp.writeFile(cachedByCodePath, catImage.body);
                        res.writeHead(200, { 'Content-Type': catImage.contentType });
                        res.end(catImage.body);
                    } catch (fetchErr) {
                        res.writeHead(404);
                        res.end('Image not found');
                    }
                    break;
                }

                try {
                    // Читаємо файл з папки кешу
                    const data = await fsp.readFile(filePath);
                    res.writeHead(200, { 'Content-Type': contentTypeFromFileName(fileName) });
                    res.end(data);
                } catch (cacheErr) {
                    if (cacheErr.code !== 'ENOENT') {
                        throw cacheErr;
                    }

                    const statusCode = extractStatusCode(fileName);
                    if (!statusCode) {
                        res.writeHead(404);
                        res.end('File not found in cache');
                        break;
                    }

                    try {
                        const catImage = await fetchCatImage(statusCode);
                        await fsp.writeFile(filePath, catImage.body);
                        res.writeHead(200, { 'Content-Type': catImage.contentType });
                        res.end(catImage.body);
                    } catch (fetchErr) {
                        res.writeHead(404);
                        res.end('Image not found');
                    }
                }
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