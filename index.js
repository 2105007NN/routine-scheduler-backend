import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import route from './route.js';
import errorHandler from './src/config/error-handle.js';

import { connect } from "./src/config/database.js";

connect()
  .then(() => console.log("Connected to the database ... "))
  .catch((err) => console.log(err));

const app = express();
const port = process.env.PORT || 8000;


app.use(cors())

app.use(express.json());
app.use(cors());
app.use("/v1", route);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Routine Scheduler listening on port ${port}`);
});
