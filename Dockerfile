FROM node:18
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip
RUN pip install -U "yt-dlp[default]" curl_cffi --break-system-packages
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]