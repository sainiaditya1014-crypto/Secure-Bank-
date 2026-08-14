# SecureBank — Internship Project

A responsive full-stack banking dashboard built with HTML, CSS, JavaScript, Node.js, Express and MySQL.

## Included features

- User registration and login using JWT (8-hour session)
- Password hashing with bcrypt (12 salt rounds)
- Create Savings or Current accounts
- Deposit and withdraw money with insufficient-balance protection
- Transaction history, account search and account deletion
- Responsive dashboard interface

## Setup

1. Install MySQL and create/import the database:
   ```sql
   mysql -u root -p < database.sql
   ```
2. Copy `.env.example` to `.env` and set your MySQL password and a strong JWT secret.
3. Install packages: `npm install`
4. Start app: `npm start`
5. Visit `http://localhost:5000`

## Project structure

```
bank-auth-project/
├── public/          # Responsive frontend
├── database.sql     # MySQL schema
├── server.js        # Express REST API
└── .env.example     # Environment configuration template
```

> For an internship demo, use a local MySQL database. In production, use HTTPS, HTTP-only secure cookies, rate limiting, validation libraries, a non-default JWT secret and secure secrets storage.
