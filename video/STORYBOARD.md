# Keystone · 60 s demo · storyboard

1920×1080, 30 fps, no voice-over. Dark theme taken from the app itself (`#0f0f0e` background,
`#f2f0ec` ink, Geist). Assets: real screenshots of Keystone captured from the running app, the
app's own shield logo SVG, and a real Android screenshot of the passkey prompt for
keystone-auth.vercel.app (emails blurred, volume overlay removed). All copy is on-site copy or a
true fact about the codebase.

Layout from scene 3 on: a caption column on the left (eyebrow + headline + detail chips) and
the product on the right, in a minimal browser or phone frame. The caption column stays put
between scenes, and only the words change with a kinetic hand-off, so cuts read as one
continuous piece.

| # | Time | Visual (asset) | Motion | On-screen text | Into next shot | Purpose |
|---|---|---|---|---|---|---|
| 1 | 0–5 s | App logo mark + wordmark | Mark scales in, wordmark slides out from behind it, headline words stagger up | "Sign in with a glance, not a password." (site hero) | Logo mark flies to the browser frame's top-left logo position (shared element) | Hook + brand |
| 2 | 5–9 s | Landing page screenshot in a browser frame | Frame rises 0.96→1, slow push-in | Three feature titles from the site as chips | Zoom-through on "Create an account" | Promise |
| 3 | 9–20 s | Sign-up: empty → Phone tab → errors → filled | Camera reframes on each field; ring highlights | "Email or phone" · "Surname + date of birth" · "Checked on the server" | Continue → same card becomes the code step (match cut) | Walkthrough 1 |
| 4 | 20–30 s | Code step: 0→6 digits, wrong-code state | Digits fill on beat; red state shakes once | "6-digit code" · "5 min · 5 tries · single use · HMAC-hashed" | Zoom-through into dashboard | Walkthrough 2 |
| 5 | 30–42 s | Dashboard "Set up Windows Hello" → real Android passkey sheet → iPhone login button | Ring on button, phone frame slides in from the button's position | "Face ID & fingerprint" · "WebAuthn passkeys" · "Bound to keystone-auth.vercel.app" | Phone frame stays; laptop frame slides in beside it | Wow moment |
| 6 | 42–53 s | Laptop dashboard + iPhone login → iPhone dashboard → laptop shows "signed out" banner → activity log | Split screen, laptop screen swaps, zoom on banner, pan down the log | "One active device" · "New sign-in → old device signed out" · "Every event logged" | Frames scale away, stack names rise | Differentiator |
| 7 | 53–57 s | Stack list (text only) | Staggered rise | Next.js 16 · TypeScript · Supabase Postgres · Drizzle · SimpleWebAuthn · Resend · Twilio · Vercel · "34 tests passing" | Words collapse into the logo | Credibility |
| 8 | 57–60 s | Logo + URLs | Hold | keystone-auth.vercel.app · github.com/Aditya060806/keystone-auth | End | CTA |
