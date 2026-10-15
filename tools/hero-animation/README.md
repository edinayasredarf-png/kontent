# Анимация для hero лендинга

`scene.html` — схематичная motion-анимация работы платформы (бренд → завод → новости → контент → публикация), 20,33 с, 24 к/с, зациклена.
`background.mp4` — фоновое видео (5,09 с), повторяется 4 раза.

Сборка (нужны `playwright-core` с установленным Chromium и `ffmpeg-static`, ставятся в отдельную папку, в проект не входят):

```bash
node cap.mjs full            # 488 кадров с прозрачностью в frames/
ffmpeg -y -i background.mp4 -framerate 24 -i frames/f%04d.png \
  -filter_complex "[0:v]trim=end_frame=122,setpts=PTS-STARTPTS,loop=loop=3:size=122:start=0,fps=24,scale=1920:-1,crop=1920:790[bg];[bg][1:v]overlay=format=auto,format=yuv420p[v]" \
  -map "[v]" -frames:v 488 -c:v libx264 -preset slow -crf 25 -movflags +faststart -an hero.mp4
```

Результат кладётся в `public/landing/hero.mp4`, заставка — кадр на 1,0 с в `public/landing/hero-poster.webp`. Время сцен и тексты правятся в `scene.html` (объект `SC` и блоки сцен).
