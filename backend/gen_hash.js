const bcrypt = require('bcrypt');
const fs = require('fs');
const hash = bcrypt.hashSync('Admin123!', 10);
fs.writeFileSync('hash_final.txt', hash);
console.log('Hash written to hash_final.txt');
