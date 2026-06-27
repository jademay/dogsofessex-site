# Community tips — how it works

Tips use **FormSubmit** (formsubmit.co) for submissions and a **manual review**
step. No backend/database.

## Submitting (visitors)
The "Share a tip" button on each walk page opens a form (Tip, optional Name,
optional Email). On submit it POSTs to FormSubmit, which **emails the tip to you**.
Nothing appears on the site automatically.

## One-time FormSubmit activation
1. The endpoint is set in `walk.js`: `FORMSUBMIT_ENDPOINT`
   (currently `https://formsubmit.co/ajax/hello@dogsofessex.co.uk`). Change the
   email if you want tips sent elsewhere.
2. The **first** submission triggers a confirmation email from FormSubmit to that
   address — click the link once to activate. After that, tips arrive by email.
3. Optional (recommended): after activation FormSubmit gives you a random string
   like `https://formsubmit.co/ajax/abc123` — use that instead of the raw email
   so your address isn't visible in the page source.

## Publishing an approved tip
Add it to **`data/tips.json`** and rebuild (CI does this on push):

```json
{
  "walkId": "tiptree-heath",
  "tip": "The back field gets muddy after rain.",
  "name": "Sarah & Luna"
}
```

- `walkId` must match the walk's id (see `data/walks.json`).
- `name` is optional (shown as a small "— Name" under the tip).
- Walks with no tips show the "Be the first to share a tip" prompt automatically.
