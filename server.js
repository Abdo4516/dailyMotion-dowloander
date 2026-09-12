const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/download', (req, res) => {
  const { url: videoUrl, quality } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  // تحديد الجودة المطلوبة
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

app.listen(3000, () => console.log('Server running on port 3000'));