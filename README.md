# 🎞 ReelSlide

**Turn any text into a LinkedIn carousel in seconds.**

Live: [youtubecarouselbuild.vercel.app](https://youtubecarouselbuild.vercel.app)

---

## What it does

You have a YouTube transcript, a meeting summary, a news article, or just raw thoughts in your notes app. You want a LinkedIn carousel. The gap between those two things is usually 45 minutes of copy-pasting, reformatting, and fiddling in Canva.

ReelSlide closes that gap. Paste your text in, hit generate, and Claude turns it into 6-8 slides: a hook, a few content slides, and a takeaway. Each slide gets a headline, body copy, and an optional stat callout. The whole thing takes about 10 seconds.

Once the slides are out, you can edit any slide inline, pick from six gradient presets, upload a custom background image, and control how much of the image shows through. Then export as a PDF you can upload directly to LinkedIn as a native carousel, or grab individual PNGs.

---

## How it works

1. Paste any text into the input field (YouTube transcript, article, meeting notes, brain dump)
2. Hit "Generate carousel" — Claude processes it server-side and returns 6-8 structured slides
3. Flip through the slides in the card preview
4. Edit the headline, body, or stat in the panel next to the slide
5. Pick one of six gradient presets, or upload your own background image
6. Use the overlay slider to control how much the image shows through vs the color
7. Export as PDF (uploads directly to LinkedIn) or PNG (single slide)

---

## The stack

```
youtube-to-carousel/
├── index.html        # the entire frontend
└── api/
    ├── generate.js   # text in, slides out (Claude)
    └── photo.js      # slide topic in, matching photo out (Unsplash)
```

That's it. One HTML file, two small serverless functions. No framework, no build step, no node_modules to commit. The frontend is vanilla JS with inline CSS. The backend calls Claude for the words and Unsplash for the pictures.

It's this simple because it doesn't need to be anything else. There's no database, no auth, no state that persists between sessions. Everything lives in memory while you're using it and disappears when you close the tab.

---

## How to steal it

### No terminal? One click.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Silicon-Valli/youtube-to-carousel&env=ANTHROPIC_API_KEY,UNSPLASH_ACCESS_KEY&envDescription=Anthropic%20API%20key%20(console.anthropic.com)%20and%20Unsplash%20Access%20Key%20(unsplash.com/developers)&envLink=https://github.com/Silicon-Valli/youtube-to-carousel%23how-to-steal-it)

Click the button, sign into Vercel with GitHub, paste two keys when it asks, and you're live. Takes about 3 minutes.

- `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com). Pay as you go, a carousel costs well under a cent.
- `UNSPLASH_ACCESS_KEY` from [unsplash.com/developers](https://unsplash.com/developers). Create an app, copy the Access Key (not the Secret). Free. Demo apps get 50 photo searches an hour, which is about 7 carousels; apply for production in the same dashboard to raise it to 5,000.

Skip the Unsplash key and the app still works, slides just get a random stand-in photo instead of a matching one.

### Or do it in the terminal

```bash
# Clone it
git clone https://github.com/Silicon-Valli/youtube-to-carousel.git
cd youtube-to-carousel

# Deploy to Vercel
vercel

# Set your keys
vercel env add ANTHROPIC_API_KEY
vercel env add UNSPLASH_ACCESS_KEY
```

That's the whole setup. Vercel detects the `api/` folder automatically and deploys both files in it as serverless functions.

### Rebuild from scratch

If you want to understand what actually makes it work, there are four functions worth reading:

**`generate.js`** is the brain. It takes raw text, sends it to `claude-sonnet-4-6` with a prompt that asks for 6-8 slides in a specific JSON shape (headline, body, stat, imageQuery), and returns that JSON. The prompt does most of the heavy lifting: it tells Claude to write like a person explaining something over coffee, to lead with numbers when they exist, and to keep headlines under 6 words.

**`photo.js`** turns Claude's `imageQuery` for each slide ("handshake office deal") into a real photo. It searches Unsplash server-side so the key never reaches the browser, returns 6 candidates so "Next photo" costs nothing, caches results for an hour, and reports a download to Unsplash when a slide is exported (their API rules ask for that).

**`renderCard()`** is what turns a slide object into something you can see. It reads the gradient index, checks for a custom background image, calculates an overlay opacity, and builds the card HTML. Every visual tweak you make in the edit panel flows back through here.

**`renderSlideToCanvas()`** is the export engine. It redraws each slide onto a 1080x1080 canvas using the Canvas API, loads the background photo with CORS, applies the gradient overlay, and lays out text manually with word-wrap logic. jsPDF then stitches the canvases into a single PDF. This is the part that breaks most often when you change something upstream.

---

## Known limitations

- Rate limited to 5 generations per IP per day (Claude API costs money)
- Photo matching is only as good as the 2-3 words Claude picks per slide. Abstract slides ("mindset") get abstract photos. "Next photo" cycles through 6 options; Upload takes over from there
- Without an Unsplash production approval, photo search caps at 50 an hour across all users. After that, slides get a random stand-in until the hour resets
- Canvas export waits for Inter Tight and Inter to load so the PDF matches the screen; if the webfonts fail, it falls back to the system sans
- PDF export can be slow on long carousels (8 slides = 8 canvas renders)
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

---

## How to write a README like this one

Copy the prompt below and paste it to Claude along with a short description of your project. It will generate a README in the same style.

<details>
<summary>Show prompt</summary>

```
Write a README.md for this project using everything you know about it from our conversation — the name, live URL, stack, core functions, limitations, and how it was built.

Follow this structure:
1. Title with emoji, bold one-liner, live demo link right at the top
2. "What it does" — the problem and solution from the user's perspective, no bullets, 2-3 short paragraphs
3. "How it works" — numbered steps showing the user flow as someone would actually experience it
4. "The stack" — file/folder tree as a code block, then explain why it's this simple
5. "How to steal it" — two sections: (a) a Deploy to Vercel button if applicable, (b) rebuild from scratch focusing on the 2-3 core functions that do the real work, with function names bolded
6. "Known limitations" — blunt bullets, no hedging
7. "What v2 could look like" — short bullet list of obvious next features
8. "Vibe coded with Claude" — one paragraph on how it was built and what the actual hard part was

Tone:
- Explain it like a smart friend, not enterprise documentation
- Short sentences, varied length
- No words like: pivotal, crucial, seamless, robust, powerful, leverage, utilize
- No em dashes
- "How to steal it" should sound genuinely inviting
- Limitations should be blunt — name the real constraints

Format:
- --- as section dividers
- Code blocks for terminal commands and file trees
- No headers beyond H2
- Save to the project folder
```

</details>
