fetch('https://civicwatch-ebev.onrender.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'test' + Date.now() + '@example.com',
        password: 'password123',
        fullName: 'John Doe'
    })
})
.then(async r => {
    console.log('Status:', r.status);
    try {
        console.log('Body:', await r.json());
    } catch (e) {
        console.log('Text:', await r.text());
    }
})
.catch(console.error);
