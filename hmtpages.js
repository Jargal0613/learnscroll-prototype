// Heat & Mass Transfer (Çengel & Ghajar, 5th ed.): printed page where each section of chapters 1–5 starts.
// PAGE NUMBERS ONLY — no textbook text. Verified 2026-11-03 against B's PDF in /workspace/books: every page was checked
// against both the table of contents and the section heading in the body. PDF page = printed page + pdfOffset (for
// the verified file, identified by its SHA-256; other copies can set their own offset in the viewer).
const HMT_PAGES = {
 "verifiedFile": {
  "sha256": "48f0bb67fe14b3324475999c3c778310a77db5c635890d29b1f62f228f8207c5",
  "pages": 1208,
  "pdfOffset": 23
 },
 "chapters": {
  "1": [
   1,
   66
  ],
  "2": [
   67,
   141
  ],
  "3": [
   142,
   236
  ],
  "4": [
   237,
   306
  ],
  "5": [
   307,
   378
  ]
 },
 "sections": {
  "1-1": 2,
  "1-2": 4,
  "1-3": 6,
  "1-4": 11,
  "1-5": 17,
  "1-6": 17,
  "1-7": 25,
  "1-8": 27,
  "1-9": 30,
  "1-10": 35,
  "1-11": 38,
  "1-topic": 43,
  "1-summary": 50,
  "2-1": 68,
  "2-2": 73,
  "2-3": 79,
  "2-4": 82,
  "2-5": 91,
  "2-6": 104,
  "2-7": 112,
  "2-topic": 115,
  "2-summary": 121,
  "3-1": 143,
  "3-2": 153,
  "3-3": 158,
  "3-4": 161,
  "3-5": 167,
  "3-6": 170,
  "3-7": 187,
  "3-8": 192,
  "3-topic": 197,
  "3-summary": 207,
  "4-1": 238,
  "4-2": 244,
  "4-3": 261,
  "4-4": 268,
  "4-topic": 276,
  "4-summary": 287,
  "5-1": 308,
  "5-2": 311,
  "5-3": 314,
  "5-4": 325,
  "5-5": 334,
  "5-topic": 352,
  "5-summary": 355
 }
};
if (typeof module !== "undefined") module.exports = HMT_PAGES;
