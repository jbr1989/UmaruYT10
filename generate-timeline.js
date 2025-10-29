import fs from "fs";

// EJECUTAR: node --env-file=.env .\generate-timeline.js

// === CONFIGURACIÓN ===
const API_KEY = process.env.YOUTUBE_API_KEY; // <-- ahora viene del .env
const CHANNEL_NAME = process.env.CHANNEL_ID;
const OUTPUT_FILE = "./data/timeline.json";

console.log("CHANNEL_NAME", CHANNEL_NAME);

// === FUNCIONES ===
async function getChannelId(handle) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(
    handle
  )}&key=${API_KEY}`;
  console.log(url);
  const res = await fetch(url);
  const data = await res.json();
  return data.items?.[0]?.snippet?.channelId;
}

async function getVideos(channelId) {
  let videos = [];
  let pageToken = "";
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${channelId}&part=snippet,id&order=date&maxResults=50&pageToken=${pageToken}`;
    const res = await fetch(url);
    const data = await res.json();
    videos = videos.concat(data.items || []);
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return videos;
}

function analyzeVideos(videos) {
  if (!videos.length) return [];

  const firstVideo = videos[videos.length - 1];
  const mostViewed = videos[0]; // no tenemos views, se ajustará luego si quieres usar otra API
  const mangaVideos = videos.filter(v =>
    /manga/i.test(v.snippet.title)
  );
  const animeVideos = videos.filter(v =>
    /anime/i.test(v.snippet.title)
  );

  const timeline = [
    {
      year: new Date(firstVideo.snippet.publishedAt).getFullYear(),
      text: "Primer video subido al canal 🎥",
    },
  ];

  if (animeVideos.length && mangaVideos.length) {
    const firstManga = mangaVideos[mangaVideos.length - 1];
    timeline.push({
      year: new Date(firstManga.snippet.publishedAt).getFullYear(),
      text: `Primer video centrado en manga: "${firstManga.snippet.title}" 📖`,
    });
  }

  timeline.push({
    year: 2025,
    text: "Celebrando 10 años compartiendo historias ❤️",
  });

  return timeline;
}

async function main() {
  console.log("🔍 Buscando canal...");
  const channelId = await getChannelId(CHANNEL_NAME);
  if (!channelId) return console.error("Canal no encontrado");

  console.log("📥 Obteniendo videos...");
  const videos = await getVideos(channelId);
  console.log(`✅ ${videos.length} videos obtenidos.`);

  console.log("🧠 Analizando...");
  const timeline = analyzeVideos(videos);

  console.log("💾 Guardando timeline...");
  fs.mkdirSync("./src/data", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(timeline, null, 2));
  console.log(`🎉 Listo! Timeline guardado en ${OUTPUT_FILE}`);
}

main().catch(console.error);
