/* Mints a token for /export and /reconcile, which are the only two routes
   with no email to arrive from. Run with your signing key:
       SIGNING_KEY=... node tools/sign-export.mjs
   The token is good for a day. */
import { signToken } from "../src/crypto.js";

const secret = process.env.SIGNING_KEY;
if (!secret) {
  console.error("Set SIGNING_KEY first (the same value you gave wrangler secret put).");
  process.exit(1);
}
const token = await signToken(secret, "export", "manual", 86400);
console.log(`?t=${token}`);
