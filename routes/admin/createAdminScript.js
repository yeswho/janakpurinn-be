require('dotenv').config({ path: '../../.env' });
const bcrypt = require('bcrypt');
const mysql = require("mysql2/promise");

async function createAdmin() {
    const adminData = {
        username: 'yeshu@admin',
        password: 'admin123',
        fullName: 'System Administrator'
    };

    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        const connection = await pool.getConnection();
        console.log("Connected to MySQL database");
        connection.release();

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(adminData.password, saltRounds);

        const [result] = await pool.execute(
            `INSERT INTO admins (username, password_hash, full_name) 
       VALUES (?, ?, ?)`,
            [adminData.username, passwordHash, adminData.fullName]
        );

        console.log('Admin created successfully!');
        console.log(`Username: ${adminData.username}`);
        console.log(`Password: ${adminData.password}`);
        console.log(`Admin ID: ${result.insertId}`);

    } catch (error) {
        console.error('Error creating admin:');

        if (error.code === 'ER_DUP_ENTRY') {
            console.error('Admin username already exists!');
        } else {
            console.error(error);
        }

    } finally {
        await pool.end();
        process.exit();
    }
}

createAdmin();