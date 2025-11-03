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