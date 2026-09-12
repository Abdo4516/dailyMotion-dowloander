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

  res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
  res.setHeader('Content-Type', 'video/mp4');

  // استخراج وتحويل الفيديو مباشرة عبر الرابط القياسي
  const ytDlp = spawn('yt-dlp', [
    '-f', 'b/w',
    '--no-playlist',
    '--no-check-certificates',
    '-o', '-',
    videoUrl
  ]);

  ytDlp.stdout.pipe(res);

  ytDlp.stderr.on('data', (data) => {
    console.error(`yt-dlp log: ${data}`);
  });

  ytDlp.on('close', (code) => {
    if (code !== 0) {
      console.log(`Process exited with code ${code}`);
    }
  });

  req.on('close', () => {
    ytDlp.kill('SIGKILL');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));