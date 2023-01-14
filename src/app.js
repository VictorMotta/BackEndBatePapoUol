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
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            from: name,
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

    if (limit <= 0 || typeof limit === "function" || !(typeof limit === "string")) {
        return res.sendStatus(422);
    }

    try {
        let messagesFiltered;
        const messages = await db.collection("messages").find().toArray();
        // const messagesAll = messages.filter((message) => message.to === "Todos");
        // const messagePrivateReceived = messages.filter((message) => message.to === user);
        // const messagePrivateSend = messages.filter((message) => message.from === user);

        if (user) {
            messagesFiltered = messages
                .filter((message) => message.to === "Todos")
                .filter((message) => message.to === user)
                .filter((message) => message.from === user);
            // messages = await db
            //     .collection("messages")
            //     .find({ $or: [{ from: user }, { to: { $in: ["Todos", user] } }] })
            //     .toArray();
        } else {
            return res.status(422);
        }

        // console.log(messagesAll);
        // console.log(messagePrivateSend);
        // console.log(messagePrivateReceived);
        // const messageSend = messages.map((message) => {
        //     return { to: message.to, text: message.text, type: message.type, from: message.from };
        // });

        const ultimasMessages = [...messagesFiltered].reverse().slice(0, parseInt(limit)).reverse();

        console.log(ultimasMessages);

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
    const time = dayjs(milissegundos).format("HH:mm:ss");

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

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    const checkUser = await db.collection("participants").findOne({ name: user });

    if (!checkUser) return res.sendStatus(422);

    try {
        await db.collection("messages").insertOne({ to, text, type, from: user, time });
        return res.sendStatus(201);
    } catch (error) {
        console.log(error);
        res.status(401).send("Erro ao enviar!");
    }
});

app.post("/status", async (req, res) => {
    const user = req.headers.user;
    const milissegundos = Date.now();

    const checkUser = await db.collection("participants").find({ name: user }).toArray();

    if (!checkUser || checkUser === null) {
        return res.status(404);
    }

    try {
        const result = await db
            .collection("participants")
            .updateOne({ name: user }, { $set: { lastStatus: milissegundos } });

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
