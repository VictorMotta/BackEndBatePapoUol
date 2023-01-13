import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
dotenv.config();

const PORT = 5000;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
    await mongoClient.connect();
    db = mongoClient.db();
    console.log("MongoDB Connected!");
} catch (err) {
    console.log(err.message);
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/participants", async (req, res) => {
    const { name } = req.body;
    console.log("Enviando...");
    console.log(typeof name);
    if (!name || typeof name != "string") {
        return res.sendStatus(422);
    }

    try {
        const milissegundos = Date.now();
        const date = dayjs(milissegundos).format("HH:mm:ss");
        const checkExists = await db.collection("participants").findOne({ name });

        if (checkExists) return res.sendStatus(409);

        await db.collection("participants").insertOne({ name, lastStatus: milissegundos });

        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: date,
        });

        return res.sendStatus(201);
    } catch (error) {
        console.log(error);
    }

    console.log("Enviado!");
    return res.sendStatus(201);
});

app.get("/participants", async (req, res) => {
    const milissegundos = Date.now();
    const segundos = dayjs(milissegundos).format("ss");
    console.log(Number(segundos));
    try {
        const participants = await db.collection("participants").find().toArray();

        res.send(participants);
    } catch (error) {
        console.log(error);
        res.status(404).send(error);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user } = req.header.user;
    const milissegundos = Date.now();
    const date = dayjs(milissegundos).format("HH:mm:ss");

    const checkUser = await db.collection("participants").findOne({ name: user });

    if (!to || !text || type != "message" || type != "private-message" || !user || !checkUser)
        return res.sendStatus(422);

    try {
        await db.collection("messages").insertOne({ from: user, to, text, type, date });
        return res.sendStatus(201);
    } catch (error) {
        console.log(error);
        res.status(401).send("Erro ao enviar!");
    }
});

app.get("/messages", async (req, res) => {
    const { limit } = req.query;
    const user = req.headers.user;

    console.log(user);

    try {
        let messages;

        if (user) {
            messages = await db.collection("messages").find({ from: user }).toArray();
        } else {
            messages = await db.collection("messages").find().toArray();
        }

        const ultimasMessages = [...messages].reverse().slice(0, parseInt(limit));

        if (limit) {
            return res.send(ultimasMessages);
        }

        return res.send(messages);
    } catch (error) {
        console.log(error);
        return res.status(404).send(error);
    }
});

app.listen(PORT, () => console.log(`O servidor está rodando na porta ${PORT}!`));
