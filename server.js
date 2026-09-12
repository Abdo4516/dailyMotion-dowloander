const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();

app.use(cors());
app.use(express.json());

// كايخلي السيرفر يعرض صفحة index.html فـ الرابط الرئيسي
app.use(express.static(path.join(__dirname)));

const TMP_DIR = path.join(os.tmpdir(), 'yt-downloads');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

app.post('/download', (req, res) => {
  const { url: videoUrl, quality } = req.body;
  if (!videoUrl) return res.status(400).send('URL missing');

  // تحديد الجودة المطلوبة (Default 480p)
  const targetQuality = quality || '480';
  const formatOption = `b[height<=${targetQuality}]/w`;

  // معرّف فريد لكل عملية تحميل
  const jobId = crypto.randomBytes(8).toString('hex');
  const outputTemplate = path.join(TMP_DIR, `${jobId}.%(ext)s`);

  const ytDlp = spawn('yt-dlp', [
    '-f', formatOption,
    '--concurrent-fragments', '5',
    '--merge-output-format', 'mp4', // يضمن ناتج mp4 حتى لو احتاج الأمر دمج
    '--ffmpeg-location', path.join(__dirname, 'ffmpeg.exe'),
    '-o', outputTemplate,
    videoUrl
  ]);

  let stderrLog = '';
  ytDlp.stderr.on('data', (data) => {
    stderrLog += data.toString();
    console.error(`yt-dlp log: ${data}`);
  });

  ytDlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
    if (!res.headersSent) res.status(500).send('Failed to start download process');
  });

  ytDlp.on('close', (code) => {
    console.log(`Process exited with code ${code}`);

    // البحث على الملف الناتج (الامتداد يقدر يختلف حسب الفورمات)
    let outputFile = null;
    try {
      const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith(jobId));
      if (files.length) outputFile = path.join(TMP_DIR, files[0]);
    } catch (e) {
      console.error('Error reading temp dir:', e);
    }

    if (code !== 0 || !outputFile || !fs.existsSync(outputFile)) {
      console.error(`Download failed. stderr tail:\n${stderrLog.slice(-800)}`);
      if (!res.headersSent) {
        return res.status(500).send('فشل التحميل: ' + stderrLog.slice(-300));
      }
      return;
    }

    const stats = fs.statSync(outputFile);
    if (stats.size === 0) {
      console.error('Output file is empty (0 bytes)');
      fs.unlink(outputFile, () => {});
      if (!res.headersSent) return res.status(500).send('التحميل رجع ملف فارغ');
      return;
    }

    // الملف كامل وسالم -> نبعتوه دابا
    res.download(outputFile, `video_${targetQuality}p.mp4`, (err) => {
      if (err) console.error('Error sending file to client:', err);
      // تنظيف الملف المؤقت من بعد الإرسال
      fs.unlink(outputFile, () => {});
    });
  });

  // إلغاء العملية إذا المستخدم سد الاتصال قبل ما تكمل
  req.on('close', () => {
    if (!res.headersSent) {
      ytDlp.kill('SIGKILL');
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
