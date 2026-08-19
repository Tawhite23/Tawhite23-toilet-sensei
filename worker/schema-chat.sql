-- AIおトイレ先生（チャット）用のテーブル。
--
-- ★ worker/schema.sql とは別ファイルにしてある。
--   あちらは DROP TABLE を含む「作り直し用」なので、既存の文字起こしデータを
--   消さずにチャット機能だけ追加できるよう、こちらは IF NOT EXISTS で書く。
--
-- 適用: cd worker && npx wrangler d1 execute otoile-search --remote -y --file=schema-chat.sql

-- 利用回数。1人あたり/サイト全体の両方の上限判定に使う。
-- 課金が発生する以上、濫用対策は必須。
CREATE TABLE IF NOT EXISTS chat_usage (
  uid   TEXT NOT NULL,       -- Firebase の UID
  day   TEXT NOT NULL,       -- YYYY-MM-DD (UTC)
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);
CREATE INDEX IF NOT EXISTS idx_chat_usage_day ON chat_usage(day);

-- 利用者ごとの設定。いまは「配信で呼ばれている名前」だけ。
-- 本人が自分で入力する方式なので、こちらから推測はしない。
CREATE TABLE IF NOT EXISTS chat_profile (
  uid      TEXT PRIMARY KEY,
  nickname TEXT,
  at       TEXT
);

-- 会話ログ。荒らし対応と品質改善のために最小限だけ残す。
-- 個人を特定しうる情報は uid のみで、氏名やメールは保存しない。
CREATE TABLE IF NOT EXISTS chat_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  uid      TEXT NOT NULL,
  at       TEXT NOT NULL,
  question TEXT,
  answer   TEXT,
  model    TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_log_at ON chat_log(at);
