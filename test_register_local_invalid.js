fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'invalid-email',
        password: '123',
        fullName: ''
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
