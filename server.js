const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// كايخلي السيرفر يعرض صفحة index.html فـ الرابط الرئيسي
app.use(express.static(path.join(__dirname)));

app.post('/download', (req, res) => {
  const { url: videoUrl, quality } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  // تحديد الجودة المطلوبة (Default 480p)
  const targetQuality = quality || '480';
  const formatOption = `b[height<=${targetQuality}]/w`;

  res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
  res.setHeader('Content-Type', 'video/mp4');

  const ytDlp = spawn('yt-dlp', [
    '-f', formatOption,
    '--concurrent-fragments', '5',
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