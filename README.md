# Encore

**When someone can no longer tell you what they love, their taste graph still can.**

Encore is a taste-memory agent for dementia caregivers. A caregiver shares a few things their person loved; Encore uses [Qloo](https://qloo.com)'s cross-domain taste graph to rebuild that person's cultural world from their formative years, then turns it into short daily sessions that learn from how they react.

> Encore is a comfort and connection tool, not a medical device or treatment.

Built for the Qloo Agentic Hackathon. Work in progress.

## Run locally

```bash
cp .env.example .env.local   # fill in QLOO_API_KEY, ANTHROPIC_API_KEY, LLM_MODEL, SUPABASE_*
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run probe                # live Qloo coverage probe → probe-output/ (gitignored)
```

## License

[MIT](LICENSE)
