-- セリフ全文検索 / 名言集 のスキーマ（Cloudflare D1 = エッジのSQLite）
--
-- ■ なぜトークナイザに unicode61 + 自前bigram なのか
--   FTS5 標準の trigram は日本語でも動くが「3文字以上」でないとヒットしない。
--   実測で 'マイクラ' は引けても '今日' が0件になり、日本語の検索語は
--   2文字が非常に多いため使い物にならなかった。
--   そこで、投入時に本文を文字bigram（例: 今日は → "今日 日は"）へ分解して
--   bg 列に入れ、検索側も同じ分解をして AND 検索する。
--   これはクライアント側 MiniSearch で使っていた方式(scripts/ja-tokenize.mjs)と
--   同一なので、移行後も検索結果の傾向が変わらない。
--
-- ■ なぜ本文(txt)まで FTS テーブルに持たせるのか
--   従来はヒット後に transcripts/<videoId>.json を別途取得して本文を出していた。
--   D1 なら検索結果と一緒に本文を返せるので、その往復が不要になる。
--   UNINDEXED を付けた列は転置索引に載らないため、検索側の肥大化はしない。

DROP TABLE IF EXISTS segments;
CREATE VIRTUAL TABLE segments USING fts5(
  bg,               -- 検索対象：本文＋読みを文字bigramに分解したもの
  vid UNINDEXED,    -- videoId
  sid UNINDEXED,    -- セグメント番号
  st  UNINDEXED,    -- 開始秒
  txt UNINDEXED,    -- 表示用の本文
  ymd UNINDEXED,    -- 配信日 YYYY-MM-DD（絞り込み・並び替え用）
  tokenize='unicode61'
);

-- 名言集。五十音の行(row)ごとにスコア順で引く。
DROP TABLE IF EXISTS quotes;
CREATE TABLE quotes (
  id      TEXT PRIMARY KEY,   -- videoId#segmentId
  vid     TEXT NOT NULL,
  sid     INTEGER NOT NULL,
  st      REAL NOT NULL,
  txt     TEXT NOT NULL,
  ymd     TEXT,               -- 配信日
  row     TEXT,               -- 五十音の行（あ/か/さ/…/その他）
  score   REAL,
  picked  INTEGER DEFAULT 0   -- 手動で選んだ「推し名言」
);
CREATE INDEX IF NOT EXISTS idx_quotes_row ON quotes(row, picked DESC, score DESC);

-- 投入済みの配信を記録し、再実行時に差分だけ入れる（D1の書き込み行数を節約する）。
-- 無料枠は 10万行/日 なので、全件を毎回入れ直すと上限に当たる。
DROP TABLE IF EXISTS ingested;
CREATE TABLE ingested (
  vid          TEXT PRIMARY KEY,
  segment_count INTEGER,
  at           TEXT
);

-- メタ情報（生成日時・総セグメント数など）を1行で持つ。
DROP TABLE IF EXISTS meta;
CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
