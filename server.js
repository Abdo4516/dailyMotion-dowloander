const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/download', (req, res) => {
  const { url: videoUrl } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  // استخراج رابط الفيديو المباشر فقط
  const cmd = `yt-dlp -g -f "best" --no-playlist --no-check-certificates "${videoUrl}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error || !stdout.trim()) {
      console.error(`yt-dlp error: ${stderr || error.message}`);
      return res.status(500).send('فشل استخراج رابط الفيديو');
    }

    // إرجاع الرابط المباشر للـ Frontend
    const directUrl = stdout.trim().split('\n')[0];
    res.json({ directUrl: directUrl });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));