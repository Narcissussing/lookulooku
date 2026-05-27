import "dotenv/config";
import express from "express";
import axios from "axios";

const app = express();
const port = 666;
const OW_API_KEY = process.env.OPENWEATHER_API_KEY;
const OW_URL = "https://api.openweathermap.org/data/2.5/weather";

// "https://api.openweathermap.org/data/2.5/weather?q=Trilport,FR&appid"
app.set("view engine", "ejs");
app.use(express.static("public"));

app.get("/", async (req, res) => {
  try {
    const response = await axios.get(OW_URL, {
      params: {
        q: "Trilport,FR",
        appid: OW_API_KEY,
        units: "metric",
        lang: "fr",
      },
    });
    const meteoTrilport = response.data;
    res.render("index.ejs", {   
      ville: meteoTrilport.name,

      temperature: meteoTrilport.main.temp.toFixed(2),

      ressenti: meteoTrilport.main.feels_like.toFixed(2),

      description: meteoTrilport.weather[0].description,

      nuages: meteoTrilport.clouds.all,

      heure: new Date(meteoTrilport.dt * 1000).toLocaleTimeString("fr-FR"),
    });
  } catch (error) {
  console.error(error.message);
  res.render("index.ejs", {
    ville: "Erreur",
    temperature: "—",
    ressenti: "—",
    description: error.message,
    nuages: "—",
    heure: "—",
  });
}
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
