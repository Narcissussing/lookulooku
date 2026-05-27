import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();
const port = 666;

app.set("view engine", "ejs");
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});