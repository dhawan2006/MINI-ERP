import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

async function hash(secretStr: string) {
  const encoder = new TextEncoder();
  const canonical = "Z5QHH-AVBH7-ZT0NZ".toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretStr),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonical)
  );
  
  console.log("Secret:", secretStr, "->", encodeHex(signature));
}

await hash('test-hmac-secret-32-chars-min-must-be-long-enough!');
await hash('"test-hmac-secret-32-chars-min-must-be-long-enough!"');
