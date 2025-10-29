import fs from "fs";

// EJECUTAR: node --env-file=.env .\generate-gallery.js

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;
const UPLOADS_PLAYLIST_ID = "UU" + CHANNEL_ID.slice(2);

const OUTPUT_VIDEOS = "./src/data/videos.json";
const OUTPUT_SHORTS = "./src/data/shorts.json";
const MAX_RESULTS_PER_PAGE = 50;

const MAX_DURATION_SHORT = 300; // 5 minutos

// === Convierte duración ISO 8601 a segundos ===
function parseDuration(durationISO) {
  const match = durationISO.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match?.[1] || "0");
  const minutes = parseInt(match?.[2] || "0");
  const seconds = parseInt(match?.[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

// === Obtiene una página de videos desde la playlist ===
async function fetchPlaylistItems(pageToken = "") {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=${MAX_RESULTS_PER_PAGE}&playlistId=${UPLOADS_PLAYLIST_ID}&key=${API_KEY}&pageToken=${pageToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`Error al obtener playlistItems: ${res.statusText}`);
  return data;
}

// === Obtiene detalles (views, duración, etc.) de un conjunto de IDs ===
async function fetchVideoDetails(videoIds) {
  if (videoIds.length === 0) return [];
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`Error al obtener detalles: ${res.statusText}`);
  return data.items || [];
}

// === Script principal ===
async function main() {
  let videosLong = [];
  let videosShorts = [];
  let pageToken = "";

  console.log("📥 Descargando todos los videos del canal...");

  do {
    const playlistData = await fetchPlaylistItems(pageToken);
    const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
    const details = await fetchVideoDetails(videoIds);

    const processed = details
      .filter(v => v.contentDetails && v.statistics)
      .map(v => {
        const duration = parseDuration(v.contentDetails.duration);
        return {
          id: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          views: parseInt(v.statistics.viewCount || "0"),
          duration,
          thumbnail:
            v.snippet.thumbnails?.high?.url ||
            v.snippet.thumbnails?.default?.url ||
            "",
        };
      });

    for (const video of processed) {
      if (video.duration > MAX_DURATION_SHORT) videosLong.push(video);
      else videosShorts.push(video);
    }

    console.log(
      `✅ Página procesada: ${videosLong.length} videos largos, ${videosShorts.length} shorts`
    );

    pageToken = playlistData.nextPageToken || "";
  } while (pageToken);

  // === Guardar archivos ===
  fs.mkdirSync("./src/data", { recursive: true });
  fs.writeFileSync(OUTPUT_VIDEOS, JSON.stringify(videosLong, null, 2));
  fs.writeFileSync(OUTPUT_SHORTS, JSON.stringify(videosShorts, null, 2));

  console.log(`🎉 Archivos generados:`);
  console.log(`📄 ${OUTPUT_VIDEOS} (${videosLong.length} videos largos)`);
  console.log(`📄 ${OUTPUT_SHORTS} (${videosShorts.length} shorts)`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
});