// Neon Auth JWKS: fetch keys and prove the verification path rejects a bogus token.
import { createRemoteJWKSet, jwtVerify } from "jose";
const url = process.env.NEON_AUTH_JWKS_URL!;
const s = performance.now();
const res = await fetch(url); const jwks = await res.json();
console.log(`JWKS fetched in ${(performance.now() - s).toFixed(0)} ms: ${jwks.keys?.length ?? 0} key(s), alg ${jwks.keys?.map((k: any) => k.alg).join(",")}`);
const set = createRemoteJWKSet(new URL(url));
try { await jwtVerify("eyJhbGciOiJSUzI1NiJ9.e30.sig", set, { issuer: process.env.NEON_AUTH_BASE_URL }); console.log("UNEXPECTED: bogus token verified"); }
catch (e: any) { console.log(`bogus token rejected as expected: ${e.code ?? e.name}`); }
