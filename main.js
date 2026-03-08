const { Command } = require('commander');
const fs = require('fs').promises; // Асинхронна робота з файлами кешу.
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const http = require('http');
const superagent = require('superagent'); // HTTP-клієнт для fallback-запиту на http.cat.

const program = new Command();

// Параметри запуску сервера: host, port і директорія кешу.
program
    .requiredOption('-h, --host <host>', 'адреса сервера')
    .requiredOption('-p, --port <port>', 'порт сервера')
    .requiredOption('-c, --cache <cache>', 'шлях до директорії кешу');

program.parse(process.argv);
const options = program.opts();

// Якщо кеш-директорії ще немає, створюємо її перед стартом сервера.
if (!existsSync(options.cache)) {
    mkdirSync(options.cache, { recursive: true });
}

const server = http.createServer(async (req, res) => {
    // URL виду "/200" перетворюємо на код "200" і мапимо у файл кешу.
    const statusCode = req.url.slice(1);
    const filePath = path.join(options.cache, `${statusCode}.jpg`);

    try {
        if (req.method === 'GET') {
            try {
                // 1) Спочатку віддаємо файл з локального кешу.
                const data = await fs.readFile(filePath);
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                return res.end(data);
            } catch (err) {
                // 2) Якщо у кеші немає, тягнемо з http.cat і кешуємо результат.
                try {
                    const response = await superagent.get(`https://http.cat/${statusCode}`).buffer(true);
                    const image = response.body;

                    await fs.writeFile(filePath, image);
                    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                    return res.end(image);
                } catch (fetchErr) {
                    // Якщо код не існує на http.cat або запит впав, повертаємо 404.
                    res.writeHead(404);
                    return res.end('Not Found');
                }
            }
        } 
        
        else if (req.method === 'PUT') {
            // Зберігаємо тіло запиту у файл кешу для цього statusCode.
            let body = Buffer.alloc(0);
            req.on('data', chunk => { body = Buffer.concat([body, chunk]); });
            req.on('end', async () => {
                await fs.writeFile(filePath, body);
                res.writeHead(201);
                res.end('Created');
            });
        } 
        
        else if (req.method === 'DELETE') {
            // Видаляємо файл з кешу, якщо він існує.
            try {
                await fs.unlink(filePath);
                res.writeHead(200);
                res.end('Deleted');
            } catch (e) {
                res.writeHead(404);
                res.end('File not found');
            }
        } 
        
        else {
            // Усі методи, крім GET/PUT/DELETE, заборонені.
            res.writeHead(405);
            res.end('Method Not Allowed');
        }
    } catch (error) {
        // Загальний fallback на неочікувані помилки обробки.
        res.writeHead(500);
        res.end('Internal Server Error');
    }
});

// Запуск HTTP-сервера з параметрами з командного рядка.
server.listen(options.port, options.host, () => {
    console.log(`Server is listening on http://${options.host}:${options.port}`);
});