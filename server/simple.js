const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Hello from Node!');
});
server.listen(8080, () => {
    console.log('Server running on 8080');
});
