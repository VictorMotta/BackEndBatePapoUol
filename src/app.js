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
        const time = dayjs(milissegundos).format("HH:mm:ss");
        const checkExists = await db.collection("participants").findOne({ name });

        if (checkExists) return res.status(409).send("Nome que já está sendo utilizado!");

        await db.collection("participants").insertOne({ name, lastStatus: milissegundos });

        await db.collection("messages").insertOne({
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            from: name,
            time,
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

    if ((limit <= 0) | (isNaN(limit) === true)) {
        return res.sendStatus(422);
    }
    if (!user) {
        return res.sendStatus(422);
    }
    try {
        // const messageSend = messages.map((message) => {
        //     return { to: message.to, text: message.text, type: message.type, from: message.from };
        // });
        const messages = await db
            .collection("messages")
            .find({ $or: [{ from: user }, { to: { $in: ["Todos", user] } }] })
            .toArray();

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

app.put("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const user = req.headers.user;
    const { to, text, type } = req.body;

    let message;

    const messagePutSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid("message").valid("private_message").required(),
        from: joi.string().required(),
    });

    const validation = messagePutSchema.validate(
        { to, text, type, from: user },
        { abortEarly: false }
    );

    if (validation.error) {
        const errors = validation.error.details.map((detail) => detail.message);
        return res.status(422).send(errors);
    }

    const verifyUser = await db.collection("participants").findOne({ name: user });

    if (!verifyUser) {
        return res.sendStatus(422);
    }

    try {
        message = await db.collection("messages").findOne({ _id: ObjectId(id) });

        if (message.from != user) {
            return res.sendStatus(401);
        }

        await db
            .collection("messages")
            .updateOne({ _id: ObjectId(id) }, { $set: { to, text, type } });

        message = await db.collection("messages").findOne({ _id: ObjectId(id) });

        res.send(message);
    } catch (error) {
        console.log(error);
        return res.sendStatus(404);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const user = req.headers.user;

    if (!user) {
        return res.sendStatus(422);
    }

    const verifyUser = await db.collection("participants").findOne({ name: user });

    if (!verifyUser) {
        return res.sendStatus(422);
    }

    try {
        const message = await db.collection("messages").findOne({ _id: ObjectId(id) });

        if (message.from != user) {
            return res.sendStatus(401);
        }

        await db.collection("messages").deleteOne({ _id: ObjectId(id) });

        return res.send("Ok");
    } catch (error) {
        console.log(error);
        return res.sendStatus(404);
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
