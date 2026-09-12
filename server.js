const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/download', (req, res) => {
  const { url: videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'URL missing' });

  // مسار الملف المؤقت
  const outputPath = path.join(__dirname, `video_${Date.now()}.mp4`);

  // تحميل الفيديو لملف مؤقت
  const cmd = `yt-dlp -f "b" --no-playlist --no-check-certificates -o "${outputPath}" "${videoUrl}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error || !fs.existsSync(outputPath)) {
      console.error(`yt-dlp error: ${stderr || error.message}`);
      return res.status(500).json({ error: 'Erreur lors du téléchargement' });
    }

    // إرسال الملف المستخرج للمستخدم
    res.download(outputPath, 'video.mp4', (err) => {
      // مسح الملف المؤقت بعد إتمام التحميل
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));