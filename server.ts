// Vercel's zero-configuration Node server detection expects a root server.ts.
// Keep the existing .mjs server as the shared implementation for local and hosted use.
import './server.mjs';
