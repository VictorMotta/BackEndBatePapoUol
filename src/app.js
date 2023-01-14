import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";
import joi from "joi";
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

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();

        res.send(participants);
    } catch (error) {
        console.log(error);
        res.status(404).send(error);
    }
});

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    const userSchema = joi.object({
        name: joi.string().required(),
    });

    const validation = userSchema.validate({ name });

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    try {
        const milissegundos = Date.now();
        const date = dayjs(milissegundos).format("HH:mm:ss");
        const checkExists = await db.collection("participants").findOne({ name });

        if (checkExists) return res.status(409).send("Nome que já está sendo utilizado!");

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
        return res.sendStatus(500);
    }
});

app.get("/messages", async (req, res) => {
    const { limit } = req.query;
    const user = req.headers.user;

    console.log(user);

    try {
        let messages;

        if (user) {
            messages = await db
                .collection("messages")
                .find({ $or: [{ from: user }, { to: { $in: ["Todos", user] } }] })
                .toArray();
        } else {
            messages = await db.collection("messages").find().toArray();
        }

        const ultimasMessages = [...messages].reverse().slice(0, parseInt(limit)).reverse();

        if (limit) {
            return res.send(ultimasMessages);
        }

        return res.send(messages);
    } catch (error) {
        console.log(error);
        return res.status(404).send(error);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const user = req.headers.user;
    const milissegundos = Date.now();
    const date = dayjs(milissegundos).format("HH:mm:ss");

    const messageSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid("message").valid("private_message").required(),
        from: joi.string().required(),
    });

    const validation = messageSchema.validate(
        { to, text, type, from: user },
        { abortEarly: false }
    );

    console.log(validation.error);

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    const checkUser = await db.collection("participants").findOne({ name: user });

    if (!checkUser) return res.sendStatus(422);

    try {
        await db.collection("messages").insertOne({ from: user, to, text, type, date });
        return res.sendStatus(201);
    } catch (error) {
        console.log(error);
        res.status(401).send("Erro ao enviar!");
    }
});

app.post("/status", async (req, res) => {
    const user = req.headers.user;
    const milissegundos = Date.now();

    console.log(milissegundos);
    const checkUser = await db.collection("participants").find({ name: user }).toArray();

    console.log(checkUser);

    if (!checkUser || checkUser === null) {
        return res.status(404);
    }
    console.log(checkUser);

    try {
        const result = await db
            .collection("participants")
            .updateOne({ name: user }, { $set: { lastStatus: milissegundos } });

        console.log(result.modifiedCount);
        console.log(result);

        if (result.modifiedCount === 0) return res.status(404).send("Esse usuário não existe!");

        res.sendStatus(200);
    } catch (error) {
        console.log(error);
        return res.status(500).send(error.message);
    }
});

setInterval(async () => {
    const listParticipants = await db.collection("participants").find().toArray();
    const milissegundos = Date.now();
    const hora = dayjs(milissegundos).format("HH:mm:ss");

    const usersDeleted = await listParticipants.filter((item) => {
        return item.lastStatus + 10000 <= Date.now();
    });

    try {
        await usersDeleted.map(async (user) => {
            await db.collection("messages").insertOne({
                from: user.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: hora,
            });
            await db.collection("participants").deleteMany(user);
        });
        console.log("Usuários ociosos desconectado!");
    } catch (error) {
        console.log(error);
    }
}, 15000);

app.listen(PORT, () => console.log(`O servidor está rodando na porta ${PORT}!`));
