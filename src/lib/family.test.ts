import assert from "node:assert/strict";
import test from "node:test";
import { tryFamilyAnswer } from "./family.ts";

test("who is Ezaan", () => {
  assert.equal(tryFamilyAnswer("who is Ezaan"), "Ezaan is a father of Devraj.");
  assert.equal(tryFamilyAnswer("Who is Ezaan?"), "Ezaan is a father of Devraj.");
});

test("who is Krishnaa, including the short spelling", () => {
  assert.equal(tryFamilyAnswer("Who is krishnaa?"), "Krishnaa is a mother of Devraj.");
  assert.equal(tryFamilyAnswer("who is Krishna"), "Krishnaa is a mother of Devraj.");
});

test("who is Devraj, Shivang, and Atmaj", () => {
  assert.equal(tryFamilyAnswer("who is Devraj"), "Devraj is a son of Ezaan and Krishnaa.");
  assert.equal(tryFamilyAnswer("who is Shivang"), "Shivang is an uncle of Devraj.");
  assert.equal(tryFamilyAnswer("who is atmaj"), "Atmaj is an uncle of Devraj.");
});

test("parents, uncles, nephew", () => {
  assert.match(tryFamilyAnswer("who are the parents of Devraj") ?? "", /Ezaan and Krishnaa/);
  assert.match(tryFamilyAnswer("Who are Devraj's parents?") ?? "", /Ezaan and Krishnaa are the parents of Devraj/);
  assert.match(tryFamilyAnswer("uncles of Devraj") ?? "", /Shivang and Atmaj/);
  assert.equal(tryFamilyAnswer("who is the nephew of Shivang"), "Devraj is a nephew of Shivang.");
  assert.equal(tryFamilyAnswer("Who is the nephew of Atmaj?"), "Devraj is a nephew of Atmaj.");
  assert.equal(tryFamilyAnswer("father of Devraj"), "Ezaan is a father of Devraj.");
});

test("yes and no", () => {
  assert.match(tryFamilyAnswer("is Ezaan the father of Devraj") ?? "", /^Yes/);
  assert.match(tryFamilyAnswer("is Krishnaa the father of Devraj") ?? "", /^No/);
});

test("does not invent a wife, and ignores ordinary questions", () => {
  assert.match(tryFamilyAnswer("who is the wife of Ezaan") ?? "", /does not say/i);
  assert.equal(tryFamilyAnswer("what is the capital of France"), null);
  assert.equal(tryFamilyAnswer("draw a portrait of a marigold"), null);
});

test("relation between the uncles stays honest", () => {
  assert.match(
    tryFamilyAnswer("how is Shivang related to Atmaj") ?? "",
    /does not say whether they are brothers/i,
  );
  assert.equal(tryFamilyAnswer("How is Shivang related to Devraj?"), "Shivang is an uncle of Devraj.");
});
