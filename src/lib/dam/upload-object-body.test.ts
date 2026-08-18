import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_FILE_BYTES } from "./accept.ts";
import { parseUploadObjectRequest } from "./upload-object-body.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe("parseUploadObjectRequest", () => {
  it("reads a raw body with x-r2-key and x-content-type", async () => {
    const request = new Request("http://localhost/api/dam/upload-object", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-r2-key": "staging/u/b/001.jpg",
        "x-content-type": "image/jpeg",
      },
      body: jpeg,
    });
    const parsed = await parseUploadObjectRequest(request);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.r2Key, "staging/u/b/001.jpg");
    assert.equal(parsed.contentType, "image/jpeg");
    assert.deepEqual(parsed.bytes, jpeg);
  });

  it("reads r2Key from the query string", async () => {
    const request = new Request(
      "http://localhost/api/dam/upload-object?r2Key=staging%2Fu%2Fb%2F002.jpg",
      {
        method: "POST",
        headers: {
          "content-type": "image/jpeg",
        },
        body: jpeg,
      },
    );
    const parsed = await parseUploadObjectRequest(request);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.r2Key, "staging/u/b/002.jpg");
    assert.equal(parsed.contentType, "image/jpeg");
  });

  it("accepts a Blob (not File) from multipart form data", async () => {
    const form = new FormData();
    form.set("r2Key", "staging/u/b/003.jpg");
    form.set("contentType", "image/jpeg");
    form.set("file", new Blob([jpeg], { type: "image/jpeg" }));
    const request = new Request("http://localhost/api/dam/upload-object", {
      method: "POST",
      body: form,
    });
    const parsed = await parseUploadObjectRequest(request);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.r2Key, "staging/u/b/003.jpg");
    assert.deepEqual(parsed.bytes, jpeg);
  });

  it("rejects oversized raw bodies", async () => {
    const request = new Request("http://localhost/api/dam/upload-object", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        "x-r2-key": "staging/u/b/big.jpg",
      },
      body: Buffer.alloc(MAX_FILE_BYTES + 1),
    });
    const parsed = await parseUploadObjectRequest(request);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.error, /zu gross/);
  });
});
