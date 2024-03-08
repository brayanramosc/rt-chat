import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { Server } from 'socket.io'
import { createServer } from 'node:http'
import { createClient } from '@libsql/client'

dotenv.config()
const port = process.env.PORT ?? 3000

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url: process.env.DB_URL,
    authToken: process.env.DB_TOKEN
})

await db.execute(`
    CREATE TABLE IF NOT EXISTS Messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT
    )
`)


io.on('connection', async (socket) => {
    console.log('a user has connected!')

    socket.on('disconnect', () => {
        console.log('an user has disconnected!')
    })

    socket.on('chat message', async (msg) => {
        let result
        try {
            result = await db.execute({
                sql: `INSERT INTO Messages (content) VALUES (:message)`,
                args: { message: msg }
            })
        } catch (error) {
            console.error(error)
            return
        }

        io.emit('chat message', msg, result.lastInsertRowid.toString())
    })

    if (!socket.recovered) {
        try {
            const results = await db.execute({
                sql: `SELECT id, content FROM Messages WHERE id > ?`,
                args: [socket.handshake.auth.serverOffset ?? 0]
            })

            results.rows.forEach(row => {
                io.emit('chat message', row.content, row.id.toString())
            })
        } catch (error) {
            console.error(error)
        }
    }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
