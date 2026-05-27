import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();
const port = 666;
const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
const OW_URL = "https://api.openweathermap.org/data/2.5/weather";
const villes = ["Trilport,FR", "Meaux,FR"];

// "https://api.openweathermap.org/data/2.5/weather?q=Trilport,FR&appid"
app.set("view engine", "ejs");
app.use(express.static("public"));

async function recupererMeteo(ville) {
  const { data } = await axios.get(OW_URL, {
    params: {
      q: ville,
      appid: OW_API_KEY,
      units: "metric",
      lang: "fr",
    },
  });

  return data;
}

app.get("/", async (req, res) => {
  try {
    const meteos = [];

    for (const ville of villes) {
      const meteo = await recupererMeteo(ville);
      meteos.push(meteo);
    }
    res.render("index.ejs", { meteos });
  } catch (error) {
    console.error(error.message);
    res.render("index.ejs", {
      meteos: [],
      erreur: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
