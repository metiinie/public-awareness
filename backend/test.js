const http = require('http');

const data = JSON.stringify({
  title: "Test Error",
  categoryId: 1,
  cityId: 1,
  areaId: 1,
  mediaUrls: ["test.jpg"]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/reports/debug-create',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
