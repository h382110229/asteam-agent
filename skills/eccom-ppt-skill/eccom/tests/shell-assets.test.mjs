import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

test("ECCOM keeps five shell-only assets from the supplied template", async () => {
  for (const role of ["cover", "contents", "section", "body", "closing"]) {
    const file = path.join(root, "assets", "shells", `${role}.png`);
    const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${role} must be PNG`);
    assert.ok(info.size > 10_000, `${role} shell is unexpectedly small`);
  }
});

test("contract records the real shell source and CJK fallback stack", async () => {
  const contract = await readFile(path.join(root, "presentation-contract.md"), "utf8");
  assert.match(contract, /assets\/shells\/(cover|contents|section|body|closing)\.png/);
  assert.match(contract, /PPT模板\.pptx/);
  assert.match(contract, /PingFang SC/);
  assert.match(contract, /Microsoft YaHei/);
  assert.match(contract, /safe.?zone/i);
});

test('all shipped assets match extraction provenance hashes and dimensions', async()=>{
  const {createHash}=await import('node:crypto');
  const provenance=JSON.parse(await readFile(path.join(root,'shell-provenance.json'),'utf8'));
  assert.equal(provenance.source.sha256.length,64);
  for(const asset of provenance.artifacts){
    const bytes=await readFile(path.resolve(root,'..',asset.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    if(asset.path.includes('/shells/'))assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[1280,720]);
  }
});
