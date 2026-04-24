# 🎞 ReelSlide

**Turn any text into a LinkedIn carousel in seconds.**

Live: [youtubecarouselbuild.vercel.app](https://youtubecarouselbuild.vercel.app)

---

## What it does

You have a YouTube transcript, a meeting summary, a news article, or just raw thoughts in your notes app. You want a LinkedIn carousel. The gap between those two things is usually 45 minutes of copy-pasting, reformatting, and fiddling in Canva.

ReelSlide closes that gap. Paste your text in, hit generate, and Claude turns it into 5-6 slides: a hook, a few content slides, and a takeaway. Each slide gets a headline, body copy, and an optional stat callout. The whole thing takes about 10 seconds.

Once the slides are out, you can edit any slide inline, swap the gradient color, upload a custom background image, and control how much of the image shows through. Then export as a PDF you can upload directly to LinkedIn as a native carousel, or grab individual PNGs.

---

## How it works

1. Paste any text into the input field (YouTube transcript, article, meeting notes, brain dump)
2. Hit "Generate carousel" — Claude processes it server-side and returns 5-6 structured slides
3. Flip through the slides in the card preview
4. Click "Edit slide" on any slide to tweak the headline, body, or stat
5. Pick a gradient color from the 8 swatches, or upload your own background image
6. Use the overlay slider to control how much the image shows through vs the color
7. Export as PDF (uploads directly to LinkedIn) or PNG (single slide)

---

## The stack

```
youtube-to-carousel/
├── index.html        # the entire frontend
└── api/
    └── generate.js   # the entire backend
```

That's it. One HTML file, one serverless function. No framework, no build step, no node_modules to commit. The frontend is vanilla JS with inline CSS. The backend is a Vercel serverless function that calls the Claude API.

It's this simple because it doesn't need to be anything else. There's no database, no auth, no state that persists between sessions. Everything lives in memory while you're using it and disappears when you close the tab.

---

## How to steal it

### No terminal? One click.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Silicon-Valli/youtube-to-carousel&env=ANTHROPIC_API_KEY&envDescription=Your%20Anthropic%20API%20key%20from%20console.anthropic.com&envLink=https://console.anthropic.com)

Click the button, sign into Vercel with GitHub, paste your Anthropic API key when it asks, and you're live. Takes about 2 minutes. Get your API key at [console.anthropic.com](https://console.anthropic.com) — it's free to start.

### Or do it in the terminal

```bash
# Clone it
git clone https://github.com/Silicon-Valli/youtube-to-carousel.git
cd youtube-to-carousel

# Deploy to Vercel
vercel

# Set your API key
vercel env add ANTHROPIC_API_KEY
```

That's the whole setup. Vercel detects the `api/` folder automatically and deploys `generate.js` as a serverless function.

### Rebuild from scratch

If you want to understand what actually makes it work, there are three functions worth reading:

**`generate.js`** is the brain. It takes raw text, sends it to `claude-sonnet-4-6` with a prompt that asks for 5-6 slides in a specific JSON shape (headline, body, stat, imageQuery), and returns that JSON. The prompt does most of the heavy lifting: it tells Claude to write like a person explaining something over coffee, to lead with numbers when they exist, and to keep headlines under 6 words.

**`renderCard()`** is what turns a slide object into something you can see. It reads the gradient index, checks for a custom background image, calculates an overlay opacity, and builds the card HTML. Every visual tweak you make in the edit panel flows back through here.

**`renderSlideToCanvas()`** is the export engine. It redraws each slide onto a 1080x1080 canvas using the Canvas API, loads the Picsum background image with CORS, applies the gradient overlay, and lays out text manually with word-wrap logic. jsPDF then stitches the canvases into a single PDF. This is the part that breaks most often when you change something upstream.

---

## Known limitations

- Rate limited to 5 generations per IP per day (Claude API costs money)
- Picsum background images are random seeds, not semantic search. The "swimming" slide might get a photo of a boat
- Canvas text rendering uses Arial fallback, not the same font as the screen preview, so exports look slightly different
- PDF export can be slow on long carousels (6 slides = 6 canvas renders)
- No way to reorder slides
- No account system, so edits are lost on refresh
- Mobile works for viewing but editing is awkward on small screens

---

## What v2 could look like

- Drag to reorder slides
- Save carousel to account (Supabase auth)
- Custom font picker
- Auto-generate a caption for the LinkedIn post along with the carousel
- Unsplash or Pexels integration for actual semantic background images
- URL input that auto-fetches and extracts the transcript

---

## Vibe coded with Claude

This was built in a single day as part of a one-app-per-day portfolio project. The architecture decisions were made for speed, not scale: one HTML file means one thing to deploy and one thing to debug. The actual hard part wasn't the Claude integration or the UI. It was the PDF export. Getting canvas rendering to match what you see on screen involves loading images with CORS proxies, manually implementing word wrap, recalculating font sizes, and carefully applying layered opacity in the right order. That function got rewritten three times. Everything else came together fast.
