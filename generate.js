import fs from "fs";

// EJECUTAR: node --env-file=.env .\generate.js

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

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
  const UPLOADS_PLAYLIST_ID = "UU" + CHANNEL_ID.slice(2);
  const MAX_RESULTS_PER_PAGE = 50;

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
async function mainVideos() {
  const OUTPUT_VIDEOS = "./src/data/videos.json";
  const OUTPUT_SHORTS = "./src/data/shorts.json";

  const MAX_DURATION_SHORT = 5 * 60; // 
  const SHORTS_START_DATE = new Date("2022-09-25T00:00:00Z");

  let videosLong = [];
  let videosShorts = [];
  let pageToken = "";

  console.log("📥 Descargando todos los videos del canal...");

  do {
    const playlistData = await fetchPlaylistItems(pageToken);
    const videoIds = playlistData.items.map(item => item.contentDetails.videoId);
    const details = await fetchVideoDetails(videoIds);

    //console.log(details);

    const processed = details
      .filter(v => v.contentDetails && v.statistics)
      .map(v => {
        const duration = parseDuration(v.contentDetails.duration);
        return {
          id: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          views: parseInt(v.statistics.viewCount || "0"),
          likes: parseInt(v.statistics.likeCount || "0"),
          duration,
          comments: parseInt(v.statistics.commentCount || "0"),
          projection: v.contentDetails.projection,
          liveBroadcastContent: v.contentDetails.liveBroadcastContent,
          thumbnail:
            v.snippet.thumbnails?.high?.url ||
            v.snippet.thumbnails?.default?.url ||
            "",
        };
      });

    for (const video of processed) {
      const publishedAtDate = new Date(video.publishedAt);
      const isShortByDuration = video.duration < MAX_DURATION_SHORT;
      const isAfterCutoff = publishedAtDate > SHORTS_START_DATE;

      if (isShortByDuration && isAfterCutoff) {
        videosShorts.push(video);
      } else {
        videosLong.push(video);
      }
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


/*** INFO CHANNEL *****/

async function fetchChannelInfo() {
  const OUTPUT_FILE = "./src/data/channel.json";

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${CHANNEL_ID}&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`Error al obtener canal: ${res.statusText}`);
  if (!data.items || data.items.length === 0)
    throw new Error("Canal no encontrado o sin datos públicos");

  const ch = data.items[0];

  const info = {
    id: ch.id,
    title: ch.snippet.title,
    description: ch.snippet.description,
    customUrl: ch.snippet.customUrl || "",
    publishedAt: ch.snippet.publishedAt,
    thumbnails: ch.snippet.thumbnails,
    banner:
      ch.brandingSettings?.image?.bannerExternalUrl ||
      ch.brandingSettings?.image?.bannerMobileExtraHdImageUrl ||
      "",
    country: ch.snippet.country || "",
    viewCount: parseInt(ch.statistics.viewCount || "0"),
    subscriberCount: parseInt(ch.statistics.subscriberCount || "0"),
    videoCount: parseInt(ch.statistics.videoCount || "0"),
  };

  fs.mkdirSync("./src/data", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(info, null, 2));
  console.log("🎉 Información del canal guardada en:", OUTPUT_FILE);
  // console.log(info);
}

// === Analiza datos existentes y genera estadísticas curiosas ===
function analyzeCuriousData() {
  const OUTPUT_FILE = "./src/data/insights.json";
  
  console.log("🔍 Analizando datos para generar insights curiosos...");
  
  // Cargar datos existentes
  let videosLong = [];
  let videosShorts = [];
  let channel = {};
  
  try {
    videosLong = JSON.parse(fs.readFileSync("./src/data/videos.json", "utf-8"));
    videosShorts = JSON.parse(fs.readFileSync("./src/data/shorts.json", "utf-8"));
    channel = JSON.parse(fs.readFileSync("./src/data/channel.json", "utf-8"));
  } catch (err) {
    console.error("❌ Error cargando datos. Ejecuta mainVideos() y fetchChannelInfo() primero.");
    return;
  }
  
  const allVideos = [...videosLong, ...videosShorts];
  
  // === 1. ANÁLISIS DE ENGAGEMENT ===
  const videosWithEngagement = allVideos
    .filter(v => v.views > 0)
    .map(v => ({
      ...v,
      engagementRate: ((v.likes + v.comments * 2) / v.views) * 100, // Comentarios valen x2
      likeRate: (v.likes / v.views) * 100,
      commentRate: (v.comments / v.views) * 100,
    }));
  
  const topEngagement = videosWithEngagement
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);
  
  // === 2. ANÁLISIS DE TÍTULOS ===
  const allTitles = allVideos.map(v => v.title);
  
  // Palabras más usadas (sin stop words comunes)
  const stopWords = new Set(['de', 'la', 'el', 'y', 'a', 'en', 'un', 'una', 'que', 'con', 'por', 'del', 'los', 'las', 'le', 'se', 'te', 'me', 'nos', 'mi', 'tu', 'su', 'sus', 'es', 'son', 'están', 'fue', 'fueron', 'ser', 'estar', 'haber', 'tener', 'hacer', 'poder', 'decir', 'ver', 'dar', 'ir', 'venir', 'salir', 'entrar', 'llegar', 'pasar', 'quedar', 'seguir', 'encontrar', 'llamar', 'dejar', 'empezar', 'terminar', 'volver', 'llevar', 'traer', 'encontrar', 'saber', 'conocer', 'pensar', 'sentir', 'creer', 'esperar', 'preguntar', 'responder', 'contar', 'mostrar', 'permitir', 'necesitar', 'querer', 'buscar', 'usar', 'trabajar', 'vivir', 'morir', 'nacer', 'crecer', 'cambiar', 'ayudar', 'necesitar', 'permitir', 'ofrecer', 'proponer', 'decidir', 'aceptar', 'rechazar', 'comenzar', 'continuar', 'terminar', 'acabar', 'empezar', 'fin', 'final', 'principio', 'comienzo', 'siguiente', 'anterior', 'nuevo', 'viejo', 'primer', 'último', 'todo', 'toda', 'todos', 'todas', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'pocos', 'pocas', 'algo', 'nada', 'alguien', 'nadie', 'algún', 'alguna', 'algunos', 'algunas', 'cualquier', 'cualquiera', 'cualesquiera', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'mismos', 'mismas', 'propio', 'propia', 'propios', 'propias', 'tal', 'tales', 'cada', 'cual', 'cuál', 'cuáles', 'qué', 'cuándo', 'dónde', 'adónde', 'de dónde', 'cómo', 'cuánto', 'cuánta', 'cuántos', 'cuántas', 'por qué', 'para qué', 'quién', 'quiénes', 'cuya', 'cuyas', 'cuyo', 'cuyos', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'aquellos', 'aquellas', 'aquí', 'ahí', 'allí', 'allá', 'acá', 'ahora', 'entonces', 'luego', 'después', 'antes', 'tarde', 'temprano', 'hoy', 'ayer', 'mañana', 'pronto', 'nunca', 'siempre', 'jamás', 'tampoco', 'también', 'sí', 'no', 'tal vez', 'quizá', 'quizás', 'acaso', 'posiblemente', 'probablemente', 'seguramente', 'ciertamente', 'verdaderamente', 'realmente', 'verdaderamente', 'realmente', 'bastante', 'demasiado', 'muy', 'más', 'menos', 'tan', 'tanto', 'casi', 'solo', 'solamente', 'únicamente', 'también', 'tampoco', 'ni', 'o', 'u', 'pero', 'mas', 'sin embargo', 'no obstante', 'aunque', 'a pesar de', 'porque', 'pues', 'ya que', 'como', 'puesto que', 'dado que', 'debido a que', 'gracias a que', 'si', 'cuando', 'mientras', 'después de que', 'antes de que', 'hasta que', 'desde que', 'tan pronto como', 'en cuanto', 'a medida que', 'según', 'conforme', 'mientras tanto', 'entretanto', 'asimismo', 'igualmente', 'del mismo modo', 'de igual manera', 'de igual forma', 'de la misma manera', 'de la misma forma', 'de la misma forma', 'de la misma manera', 'del mismo modo', 'de igual modo', 'de igual forma', 'de igual manera', 'asimismo', 'igualmente', 'también', 'tampoco', 'ni', 'ni siquiera', 'ni tampoco', 'ni tan siquiera', 'ni siquiera', 'ni tampoco', 'ni tan siquiera', "a", "ante", "bajo", "cabe", "como", "con", "contra", "de", "desde", "durante", "en", "entre", "hacia", "hasta", "mediante", "para", "por", "según", "sin", "sobre", "tras", "versus", "vía", "mi", "mis", "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras", "vuestro", "vuestra", "vuestros", "vuestras"]);
  
  const wordCount = {};
  allTitles.forEach(title => {
    const words = title.toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });
  
  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));
  
  // Emojis más usados
  const emojiCount = {};
  allTitles.forEach(title => {
    const emojis = title.match(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || [];
    emojis.forEach(emoji => {
      emojiCount[emoji] = (emojiCount[emoji] || 0) + 1;
    });
  });
  
  const topEmojis = Object.entries(emojiCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([emoji, count]) => ({ emoji, count }));
  
  // Longitud promedio de títulos
  const titleLengths = allTitles.map(t => t.length);
  const avgTitleLength = titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length;
  const longestTitle = allTitles.reduce((a, b) => a.length > b.length ? a : b, "");
  const shortestTitle = allTitles.reduce((a, b) => a.length < b.length ? a : b, "");
  
  // === 3. ANÁLISIS TEMPORAL ===
  const videosByDay = {};
  const videosByHour = {};
  const videosByMonth = {};
  
  videosLong.forEach(video => {
    const date = new Date(video.publishedAt);
    const day = date.toLocaleDateString('es-ES', { weekday: 'long' });
    const hour = date.getUTCHours();
    const month = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    
    videosByDay[day] = (videosByDay[day] || 0) + 1;
    videosByHour[hour] = (videosByHour[hour] || 0) + 1;
    videosByMonth[month] = (videosByMonth[month] || 0) + 1;
  });
  
  const bestDay = Object.entries(videosByDay)
    .sort((a, b) => b[1] - a[1])[0];
  
  const bestHour = Object.entries(videosByHour)
    .sort((a, b) => b[1] - a[1])[0];
  
  // Calcular racha más larga de publicación
  const sortedVideos = [...allVideos].sort((a, b) => 
    new Date(a.publishedAt) - new Date(b.publishedAt)
  );
  
  let maxStreak = 0;
  let currentStreak = 0;
  let streakStart = null;
  let maxStreakStart = null;
  
  for (let i = 1; i < sortedVideos.length; i++) {
    const prevDate = new Date(sortedVideos[i - 1].publishedAt);
    const currDate = new Date(sortedVideos[i].publishedAt);
    const daysDiff = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {
      if (currentStreak === 0) streakStart = prevDate;
      currentStreak++;
    } else {
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStreakStart = streakStart;
      }
      currentStreak = 0;
    }
  }
  
  // === 4. ANÁLISIS DE DURACIÓN ===
  const durations = videosLong.map(v => v.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  
  // Videos por rango de duración
  const durationRanges = {
    '0-1min': videosLong.filter(v => v.duration <= 60).length,
    '1-5min': videosLong.filter(v => v.duration > 60 && v.duration <= 300).length,
    '5-10min': videosLong.filter(v => v.duration > 300 && v.duration <= 600).length,
    '10-20min': videosLong.filter(v => v.duration > 600 && v.duration <= 1200).length,
    '20-60min': videosLong.filter(v => v.duration > 1200 && v.duration <= 3600).length,
    '60min+': videosLong.filter(v => v.duration > 3600).length,
  };
  
  // Duración óptima (videos con mejor engagement)
  const videosByDurationRange = {
    '0-5min': videosWithEngagement.filter(v => v.duration <= 300),
    '5-15min': videosWithEngagement.filter(v => v.duration > 300 && v.duration <= 900),
    '15-30min': videosWithEngagement.filter(v => v.duration > 900 && v.duration <= 1800),
    '30min+': videosWithEngagement.filter(v => v.duration > 1800),
  };
  
  const optimalDuration = Object.entries(videosByDurationRange)
    .map(([range, videos]) => ({
      range,
      avgEngagement: videos.reduce((sum, v) => sum + v.engagementRate, 0) / videos.length || 0,
      count: videos.length,
    }))
    .filter(d => d.count > 0)
    .sort((a, b) => b.avgEngagement - a.avgEngagement)[0];
  
  // === 5. COMPARATIVA SHORTS VS VIDEOS LARGOS ===
  const shortsStats = {
    total: videosShorts.length,
    totalViews: videosShorts.reduce((sum, v) => sum + v.views, 0),
    totalLikes: videosShorts.reduce((sum, v) => sum + v.likes, 0),
    totalComments: videosShorts.reduce((sum, v) => sum + v.comments, 0),
    avgViews: videosShorts.reduce((sum, v) => sum + v.views, 0) / videosShorts.length || 0,
    avgEngagement: videosShorts.length > 0 
      ? videosWithEngagement.filter(v => videosShorts.some(s => s.id === v.id))
          .reduce((sum, v) => sum + v.engagementRate, 0) / videosShorts.length
      : 0,
  };
  
  const longVideosStats = {
    total: videosLong.length,
    totalViews: videosLong.reduce((sum, v) => sum + v.views, 0),
    totalLikes: videosLong.reduce((sum, v) => sum + v.likes, 0),
    totalComments: videosLong.reduce((sum, v) => sum + v.comments, 0),
    avgViews: videosLong.reduce((sum, v) => sum + v.views, 0) / videosLong.length || 0,
    avgEngagement: videosLong.length > 0
      ? videosWithEngagement.filter(v => videosLong.some(s => s.id === v.id))
          .reduce((sum, v) => sum + v.engagementRate, 0) / videosLong.length
      : 0,
  };
  
  // === 6. VIDEOS DESTACADOS ===
  const hiddenGems = videosWithEngagement
    .filter(v => v.views < 10000 && v.engagementRate > 5) // Poco visto pero buen engagement
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);
  
  const consistentPerformers = videosWithEngagement
    .filter(v => v.views > 1000 && v.views < 50000) // Rango medio estable
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 10);
  
  // === 7. ESTADÍSTICAS GENERALES ===
  const totalDuration = allVideos.reduce((sum, v) => sum + v.duration, 0);
  
  // === 8. DETECCIÓN DE SERIES (por patrones en títulos) ===
  const seriesPatterns = /(?:parte|part|episodio|ep|capítulo|cap|tomo|volumen|vol|#\d+|\d+ª? parte|unboxing|unbox|review|opinión|sorteo|directo|stream)/i;
  const seriesMap = new Map();
  
  allVideos.forEach(video => {
    const match = video.title.match(seriesPatterns);
    if (match) {
      // Extraer nombre base de la serie
      const words = video.title.toLowerCase()
        .replace(/[^\w\sáéíóúñü]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
        .slice(0, 3); // Primeras 3 palabras relevantes
      
      const seriesKey = words.join(' ').substring(0, 30);
      
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, []);
      }
      seriesMap.get(seriesKey).push(video);
    }
  });
  
  const topSeries = Array.from(seriesMap.entries())
    .map(([name, videos]) => ({
      name,
      count: videos.length,
      totalViews: videos.reduce((sum, v) => sum + v.views, 0),
      avgViews: videos.reduce((sum, v) => sum + v.views, 0) / videos.length,
      videos: videos.map(v => ({ id: v.id, title: v.title, views: v.views })).slice(0, 5),
    }))
    .filter(s => s.count >= 3) // Series con al menos 3 videos
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  
  // === 9. VIDEOS CONVERSACIONALES (más comentarios que likes) ===
  const conversationalVideos = videosWithEngagement
    .filter(v => v.comments > v.likes && v.comments > 10)
    .sort((a, b) => b.comments - a.comments)
    .slice(0, 10);
  
  // === 10. ANÁLISIS DE HASHTAGS ===
  const hashtagCount = {};
  allTitles.forEach(title => {
    const hashtags = title.match(/#[\wáéíóúñü]+/gi) || [];
    hashtags.forEach(tag => {
      const tagLower = tag.toLowerCase();
      hashtagCount[tagLower] = (hashtagCount[tagLower] || 0) + 1;
    });
  });
  
  const topHashtags = Object.entries(hashtagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));
  
  // === 11. EVOLUCIÓN TEMPORAL (primeros 100 vs últimos 100 videos) ===
  const sortedByDate = [...allVideos].sort((a, b) => 
    new Date(a.publishedAt) - new Date(b.publishedAt)
  );
  
  const first100 = sortedByDate.slice(0, 100);
  const last100 = sortedByDate.slice(-100);
  
  const evolutionComparison = {
    first100: {
      avgViews: first100.reduce((sum, v) => sum + v.views, 0) / first100.length || 0,
      avgLikes: first100.reduce((sum, v) => sum + v.likes, 0) / first100.length || 0,
      avgComments: first100.reduce((sum, v) => sum + v.comments, 0) / first100.length || 0,
      avgDuration: first100.reduce((sum, v) => sum + v.duration, 0) / first100.length || 0,
    },
    last100: {
      avgViews: last100.reduce((sum, v) => sum + v.views, 0) / last100.length || 0,
      avgLikes: last100.reduce((sum, v) => sum + v.likes, 0) / last100.length || 0,
      avgComments: last100.reduce((sum, v) => sum + v.comments, 0) / last100.length || 0,
      avgDuration: last100.reduce((sum, v) => sum + v.duration, 0) / last100.length || 0,
    },
    growth: {
      viewsGrowth: last100.length > 0 && first100.length > 0
        ? Math.round(((last100.reduce((sum, v) => sum + v.views, 0) / last100.length) / 
           (first100.reduce((sum, v) => sum + v.views, 0) / first100.length) - 1) * 100)
        : 0,
      likesGrowth: last100.length > 0 && first100.length > 0
        ? Math.round(((last100.reduce((sum, v) => sum + v.likes, 0) / last100.length) / 
           (first100.reduce((sum, v) => sum + v.likes, 0) / first100.length) - 1) * 100)
        : 0,
    },
  };
  
  // === 12. VIDEOS DE DIRECTOS vs NORMALES ===
  const liveVideos = allVideos.filter(v => v.liveBroadcastContent === 'live' || v.liveBroadcastContent === 'upcoming');
  const normalVideos = allVideos.filter(v => v.liveBroadcastContent === 'none');
  
  const liveVsNormal = {
    live: {
      count: liveVideos.length,
      avgViews: liveVideos.length > 0 ? liveVideos.reduce((sum, v) => sum + v.views, 0) / liveVideos.length : 0,
      avgLikes: liveVideos.length > 0 ? liveVideos.reduce((sum, v) => sum + v.likes, 0) / liveVideos.length : 0,
      avgComments: liveVideos.length > 0 ? liveVideos.reduce((sum, v) => sum + v.comments, 0) / liveVideos.length : 0,
      avgDuration: liveVideos.length > 0 ? liveVideos.reduce((sum, v) => sum + v.duration, 0) / liveVideos.length : 0,
    },
    normal: {
      count: normalVideos.length,
      avgViews: normalVideos.length > 0 ? normalVideos.reduce((sum, v) => sum + v.views, 0) / normalVideos.length : 0,
      avgLikes: normalVideos.length > 0 ? normalVideos.reduce((sum, v) => sum + v.likes, 0) / normalVideos.length : 0,
      avgComments: normalVideos.length > 0 ? normalVideos.reduce((sum, v) => sum + v.comments, 0) / normalVideos.length : 0,
      avgDuration: normalVideos.length > 0 ? normalVideos.reduce((sum, v) => sum + v.duration, 0) / normalVideos.length : 0,
    },
  };
  
  // === 13. PALABRAS CLAVE QUE CORRELACIONAN CON MEJOR ENGAGEMENT ===
  const wordEngagementMap = new Map();
  
  videosWithEngagement.forEach(video => {
    const words = video.title.toLowerCase()
      .replace(/[^\w\sáéíóúñü]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    
    words.forEach(word => {
      if (!wordEngagementMap.has(word)) {
        wordEngagementMap.set(word, { totalEngagement: 0, count: 0 });
      }
      const stats = wordEngagementMap.get(word);
      stats.totalEngagement += video.engagementRate;
      stats.count++;
    });
  });
  
  const wordsWithBestEngagement = Array.from(wordEngagementMap.entries())
    .map(([word, stats]) => ({
      word,
      avgEngagement: stats.totalEngagement / stats.count,
      count: stats.count,
    }))
    .filter(w => w.count >= 5) // Palabras que aparecen en al menos 5 videos
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 20);
  
  // === 14. VIDEOS CON MEJOR RATIO COMENTARIOS/LIKES (más conversacionales) ===
  const commentRatio = videosWithEngagement
    .filter(v => v.likes > 0)
    .map(v => ({
      ...v,
      commentToLikeRatio: v.comments / v.likes,
    }))
    .sort((a, b) => b.commentToLikeRatio - a.commentToLikeRatio)
    .slice(0, 10);
  
  // === 15. ANÁLISIS DE PATRONES DE TÍTULOS ===
  const titlePatterns = {
    questions: allVideos.filter(v => v.title.includes('?') || v.title.includes('¿')).length,
    exclamations: allVideos.filter(v => v.title.includes('!') || v.title.includes('¡')).length,
    lists: allVideos.filter(v => /^\d+[\.\)]|top \d+|los \d+/i.test(v.title)).length,
    tutorials: allVideos.filter(v => /cómo|tutorial|guía|paso a paso/i.test(v.title)).length,
    reviews: allVideos.filter(v => /review|opinión|análisis|crítica/i.test(v.title)).length,
    unboxing: allVideos.filter(v => /unbox|abrir|caja|pack/i.test(v.title)).length,
    sorteo: allVideos.filter(v => /sorteo|giveaway|regalo/i.test(v.title)).length,
    directo: allVideos.filter(v => /directo|stream|live|en vivo/i.test(v.title)).length,
  };
  
  // === 16. VIDEOS CON MEJOR VELOCIDAD DE VISTAS (viralidad potencial) ===
  const now = new Date();
  const videosWithAge = allVideos
    .map(v => {
      const publishedDate = new Date(v.publishedAt);
      const ageInDays = (now - publishedDate) / (1000 * 60 * 60 * 24);
      return {
        ...v,
        ageInDays,
        viewsPerDay: ageInDays > 0 ? v.views / ageInDays : v.views,
      };
    })
    .filter(v => v.ageInDays > 0);
  
  const fastestGrowing = [...videosWithAge]
    .sort((a, b) => b.viewsPerDay - a.viewsPerDay)
    .slice(0, 10);
  
  // === 17. MESES MÁS PRODUCTIVOS (por cantidad y por engagement) ===
  const monthlyStats = {};
  videosWithEngagement.forEach(video => {
    const date = new Date(video.publishedAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        count: 0,
        totalViews: 0,
        totalEngagement: 0,
        videos: [],
      };
    }
    
    monthlyStats[monthKey].count++;
    monthlyStats[monthKey].totalViews += video.views;
    monthlyStats[monthKey].totalEngagement += video.engagementRate;
    monthlyStats[monthKey].videos.push(video.id);
  });
  
  const topMonthsByCount = Object.entries(monthlyStats)
    .map(([month, stats]) => ({
      month,
      count: stats.count,
      avgViews: stats.totalViews / stats.count,
      avgEngagement: stats.totalEngagement / stats.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const topMonthsByEngagement = Object.entries(monthlyStats)
    .filter(([_, stats]) => stats.count >= 3) // Al menos 3 videos
    .map(([month, stats]) => ({
      month,
      count: stats.count,
      avgViews: stats.totalViews / stats.count,
      avgEngagement: stats.totalEngagement / stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 10);
  
  // === COMPILAR RESULTADOS ===
  const insights = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalVideos: allVideos.length,
      totalVideosLong: videosLong.length,
      totalShorts: videosShorts.length,
      totalDuration: totalDuration,
      totalViews: allVideos.reduce((sum, v) => sum + v.views, 0),
      totalLikes: allVideos.reduce((sum, v) => sum + v.likes, 0),
      totalComments: allVideos.reduce((sum, v) => sum + v.comments, 0),
    },
    engagement: {
      topEngagementVideos: topEngagement.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        engagementRate: Math.round(v.engagementRate * 100) / 100,
        likeRate: Math.round(v.likeRate * 100) / 100,
        commentRate: Math.round(v.commentRate * 100) / 100,
      })),
      avgEngagementRate: videosWithEngagement.length > 0
        ? Math.round((videosWithEngagement.reduce((sum, v) => sum + v.engagementRate, 0) / videosWithEngagement.length) * 100) / 100
        : 0,
    },
    titles: {
      topWords,
      topEmojis,
      topHashtags,
      avgLength: Math.round(avgTitleLength * 10) / 10,
      longestTitle: {
        title: longestTitle,
        length: longestTitle.length,
      },
      shortestTitle: {
        title: shortestTitle,
        length: shortestTitle.length,
      },
    },
    timing: {
      bestDay: {
        day: bestDay[0],
        count: bestDay[1],
      },
      bestHour: {
        hour: bestHour[0],
        count: bestHour[1],
      },
      videosByDay,
      videosByHour,
      videosByMonth,
      longestStreak: {
        days: maxStreak,
        startDate: maxStreakStart?.toISOString(),
      },
    },
    duration: {
      avgDurationSeconds: Math.round(avgDuration),
      avgDurationFormatted: formatDuration(Math.round(avgDuration)),
      distribution: durationRanges,
      optimalRange: optimalDuration,
    },
    comparison: {
      shorts: shortsStats,
      longVideos: longVideosStats,
    },
    highlights: {
      hiddenGems: hiddenGems.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        engagementRate: Math.round(v.engagementRate * 100) / 100,
      })),
      consistentPerformers: consistentPerformers.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        engagementRate: Math.round(v.engagementRate * 100) / 100,
      })),
    },
    series: {
      topSeries: topSeries.map(s => ({
        name: s.name,
        count: s.count,
        totalViews: s.totalViews,
        avgViews: Math.round(s.avgViews),
        videos: s.videos,
      })),
    },
    conversational: {
      topConversationalVideos: conversationalVideos.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        commentToLikeRatio: Math.round((v.comments / v.likes) * 100) / 100,
      })),
    },
    evolution: evolutionComparison,
    liveVsNormal,
    keywords: {
      wordsWithBestEngagement: wordsWithBestEngagement.map(w => ({
        word: w.word,
        avgEngagement: Math.round(w.avgEngagement * 100) / 100,
        count: w.count,
      })),
    },
    commentRatio: {
      topByCommentRatio: commentRatio.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        commentToLikeRatio: Math.round(v.commentToLikeRatio * 100) / 100,
      })),
    },
    titlePatterns,
    viral: {
      fastestGrowing: fastestGrowing.map(v => ({
        id: v.id,
        title: v.title,
        views: v.views,
        ageInDays: Math.round(v.ageInDays),
        viewsPerDay: Math.round(v.viewsPerDay),
      })),
    },
    productivity: {
      topMonthsByCount: topMonthsByCount.map(m => ({
        month: m.month,
        count: m.count,
        avgViews: Math.round(m.avgViews),
        avgEngagement: Math.round(m.avgEngagement * 100) / 100,
      })),
      topMonthsByEngagement: topMonthsByEngagement.map(m => ({
        month: m.month,
        count: m.count,
        avgViews: Math.round(m.avgViews),
        avgEngagement: Math.round(m.avgEngagement * 100) / 100,
      })),
    },
  };
  
  // Guardar
  fs.mkdirSync("./src/data", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(insights, null, 2));
  
  console.log(`🎉 Insights generados en: ${OUTPUT_FILE}`);
  console.log(`📊 Top palabra: "${topWords[0]?.word}" (${topWords[0]?.count} veces)`);
  console.log(`📊 Mejor día: ${bestDay[0]} (${bestDay[1]} videos)`);
  console.log(`📊 Mejor hora: ${bestHour[0]}:00 UTC (${bestHour[1]} videos)`);
  console.log(`📊 Racha más larga: ${maxStreak} días`);
  console.log(`📊 Duración óptima: ${optimalDuration?.range || 'N/A'}`);
  console.log(`📊 Top serie detectada: "${topSeries[0]?.name || 'N/A'}" (${topSeries[0]?.count || 0} videos)`);
  console.log(`📊 Hashtag más usado: ${topHashtags[0]?.tag || 'N/A'} (${topHashtags[0]?.count || 0} veces)`);
  console.log(`📊 Crecimiento de vistas: ${evolutionComparison.growth.viewsGrowth > 0 ? '+' : ''}${evolutionComparison.growth.viewsGrowth}%`);
  console.log(`📊 Mejor palabra clave (engagement): "${wordsWithBestEngagement[0]?.word || 'N/A'}"`);
  console.log(`📊 Videos de directos: ${liveVsNormal.live.count} | Videos normales: ${liveVsNormal.normal.count}`);
}

// === Formatea duración en formato legible ===
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

async function main() {
  await mainVideos();
  await fetchChannelInfo();
  // Analizar datos curiosos (sin llamadas adicionales a la API)
  analyzeCuriousData();
}

main().catch(err => {
  console.error("❌ Error:", err.message);
});