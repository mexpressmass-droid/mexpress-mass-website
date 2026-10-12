# Dispatch test deployment

This file triggers a fresh Cloudflare build from the `dispatch-test` branch after configuring it as the production branch of the isolated `mexpress-dispatch-test` Worker.

Use `node build.mjs` for the build and `npx wrangler deploy --config wrangler.dispatch-test.jsonc` for deployment. Do not deploy the live `mexpress-mass-website` Worker from this branch.
