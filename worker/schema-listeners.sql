-- リスナー名鑑の「キー → チャンネルID」の対応表（Cloudflare D1）。
--
-- 名鑑のデータ(public/data/listeners.json)にはチャンネルIDを載せていない。
-- Worker の /api/listeners/profiles が、最新の名前とアイコンを YouTube に聞くためだけに使う。
-- この表の中身は API から外へ出さない（worker/src/listeners.ts）。
--
-- 中身は scripts/build-listeners.py が out/listeners/listener-ids.sql に書き出し、
-- npm run sync-listeners で丸ごと入れ替える（名鑑に載る人だけ・数百行）。
CREATE TABLE IF NOT EXISTS listener_ids (
  key TEXT PRIMARY KEY,   -- listeners.json の key（ソルト付きハッシュ）
  cid TEXT NOT NULL       -- YouTube のチャンネルID (UC...)
);
