const jwt = require('jsonwebtoken');

const payload = { 
    id: "69b3e800d89eb4ce0c43c3f8", 
    email: "sub@example.com", 
    parentId: "69b3e7b4d89eb4ce0c43c3f2" 
};
const secret = "your_jwt_secret_key";
const token = jwt.sign(payload, secret);

console.log("Token:", token);
const decoded = jwt.verify(token, secret);
console.log("Decoded:", decoded);
console.log("parentId exists:", !!decoded.parentId);
console.log("parentId value:", decoded.parentId);
