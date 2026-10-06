# Images and videos in questions

A question can show an image or a video, for example "Watch the animation. Which algorithm is it?". BitQuiz never stores media files itself, which keeps it free to host. Media comes from one of two places:

| Source | Use it for | Needs |
| --- | --- | --- |
| **Link** | YouTube videos, Google Drive files, any `https://` image or video | Internet on the projector computer |
| **File on the projector computer** | Videos and images you keep in a folder on that laptop | Nothing online; works without internet |

**Videos play on the projector only.** Phones show the question with "Watch the screen", so hundreds of phones never download a video. An **image** from a link can also be shown on phones ("Also show this image on participants' phones").

## Adding media to a question

In the question editor, choose **Media → Image** or **Video**, pick where it comes from, and paste the link or type the file name. A preview appears under the field.

In a CSV import, use the last three columns:

| Column | Value |
| --- | --- |
| `media_type` | `image` or `video` |
| `media` | A link starting with `https://`, or a file name such as `round2-q1.mp4` |
| `media_on_phones` | `yes` to also show a linked image on phones |

Download the template from the editor for an example.

## Links

- **YouTube (recommended for videos):** upload as **Unlisted** so it doesn't appear in search, then paste the normal link (`https://youtu.be/…` or `https://www.youtube.com/watch?v=…`). A start time like `?t=30` is kept. BitQuiz uses YouTube's privacy-enhanced player and hides suggested videos from other channels.
- **Google Drive:** share the file as **Anyone with the link → Viewer**, then paste the share link. Drive videos can be played and paused on the projector, but the console's Play/Pause/Restart buttons don't control them; use YouTube or a file for full control.
- **Other sites:** any `https://` link to an image (`.png`, `.jpg`, `.gif`, `.webp`, `.svg`) or a video file (`.mp4`, `.webm`) works if the site allows embedding.

## Files on the projector computer

Best when the venue internet is unreliable or the video must be in full quality.

1. Put the files in one folder on the projector laptop. Use **neutral names** such as `round2-q1.mp4`: the names are visible in the projector's setup dialog and could hint at the answer.
2. In the editor, choose **File on the projector computer** and type the exact file name.
3. At the event, open the projector screen, click **Media files** (bottom left) and **Choose folder**. The button shows how many of the needed files are loaded, e.g. `Media files 3/3`.

The files stay in that browser after a refresh and are never uploaded. Use the same browser on the same computer during the event; private windows can't keep them.

Videos play inside the browser: **MP4 (H.264)** or **WebM** work everywhere. If a video won't play, convert it to MP4 (H.264), for example with HandBrake.

## During the quiz

A question with an image or video is shown in two steps, so the room watches first and reads the options afterwards:

| Console button | Projector | Phones |
| --- | --- | --- |
| **Show next question** | The image or video alone, large; **the video starts automatically** | "Watch the screen", no question and no options |
| **Show question & options** | The video stops and the question and options replace it, text only like any other question | The question and options, locked |
| **Open answering** | Timer runs | Participants answer |

- While the video is on screen, use **Pause video**, **Play video** and **Restart** in the console. When it ends, the projector shows "Video finished" and the console offers **Replay video**. The console preview is muted; sound plays on the projector.
- In the first step the question text and options are not sent to phones or the projector at all, so nobody can read them early.
- **Show + open answering** goes from the video straight to answering when time is short.
- The media always comes first: **Show + open next** isn't offered when the next question has media.
- Questions without media are shown in one step as before.
- The main button ignores a second click until the first one has taken effect, so a double click never runs two steps.

Browsers block video sound until someone clicks the page. Click **Go fullscreen** on the projector before the quiz starts. If a video still doesn't start, the projector shows **Click to start the video**.

## Don't give away the answer

For questions like "Which algorithm is this?", anything on screen can be a hint.

- **YouTube shows the video's title and channel** on the projector (at the start and when paused), and YouTube doesn't allow hiding it. Upload your own video as **Unlisted** with a neutral title such as "Round 2 Q1", or use a file on the projector computer instead. On the projector BitQuiz turns off YouTube's controls and hover overlays, but the title can still appear.
- **Google Drive** shows the file name in its player: give the file a neutral name.
- **Files on the projector computer** show no title at all. They're the safest choice for this kind of question. Still use neutral file names (`round2-q1.mp4`), because the names appear in the projector's "Media files" dialog.
- The editor shows a warning when a video question uses YouTube or Drive.

## Before the event

- [ ] Every linked video and image opens on the projector computer, with sound.
- [ ] For projector files: `Media files` shows all files loaded (for example `3/3`).
- [ ] Projector volume is tested in the hall.
- [ ] YouTube videos are Unlisted (not Private) and Drive files are shared with "Anyone with the link".
- [ ] Video titles and file names don't reveal answers.
