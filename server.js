const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/download', (req, res) => {
  const { url: videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'URL missing' });

  // Basic sanity check on the URL (avoid passing garbage / flags to yt-dlp)
  if (typeof videoUrl !== 'string' || !/^https?:\/\//i.test(videoUrl)) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  // On envoie les headers de téléchargement dès le départ,
  // puis on stream directement la sortie de yt-dlp vers la réponse.
  // -> plus de fichier temporaire, plus de limite de buffer, plus rapide.
  res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
  res.setHeader('Content-Type', 'video/mp4');

  const args = [
    '-f', 'b',
    '--no-playlist',
    '--no-check-certificates',
    '--no-progress',      // évite de spammer stdout/stderr
    '--no-part',
    '-o', '-',             // écrit le flux vidéo sur stdout au lieu d'un fichier
    videoUrl
  ];

  const ytdlp = spawn('yt-dlp', args);

  let stderrTail = '';
  ytdlp.stderr.on('data', (chunk) => {
    stderrTail += chunk.toString();
    if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000);
  });

  let responseStarted = false;
  ytdlp.stdout.once('data', () => { responseStarted = true; });
  ytdlp.stdout.pipe(res);

  ytdlp.on('error', (err) => {
    console.error('Impossible de démarrer yt-dlp:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur serveur (yt-dlp introuvable ?)' });
    } else {
      res.end();
    }
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error(`yt-dlp exited with code ${code}. stderr:\n${stderrTail}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erreur lors du téléchargement' });
      } else if (!res.writableEnded) {
        // On a déjà commencé à streamer -> on ne peut plus renvoyer du JSON,
        // on coupe juste la connexion proprement.
        res.end();
      }
    }
  });

  // Si l'utilisateur ferme l'onglet / annule le fetch, on tue yt-dlp
  // pour ne pas laisser des process zombies tourner sur le serveur.
  req.on('close', () => {
    if (!ytdlp.killed) ytdlp.kill('SIGKILL');
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Les vidéos longues peuvent prendre plusieurs minutes à télécharger :
// on désactive/augmente les timeouts par défaut de Node pour ne pas
// couper la connexion en plein milieu.
server.requestTimeout = 0;          // pas de timeout sur la requête
server.headersTimeout = 0;          // pas de timeout sur les headers
server.keepAliveTimeout = 620000;   // 10+ minutes
