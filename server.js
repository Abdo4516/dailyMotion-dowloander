const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// عرض الواجهة index.html فـ الرابط الرئيسي
app.use(express.static(path.join(__dirname)));

app.post('/download', (req, res) => {
  const { url: videoUrl } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
  res.setHeader('Content-Type', 'video/mp4');

  // تحميل بأعلى جودة مباشرة (1080p / 4K) بدون دمج معقد
  const ytDlp = spawn('yt-dlp', [
    '-f', 'best',
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));